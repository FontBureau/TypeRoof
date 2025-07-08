/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , getEntry
  , getDraftEntry
  , ForeignKey
  , unwrapPotentialWriteProxy
  , CoherenceFunction
  , StaticDependency
} from '../../metamodel.mjs';

import {
     zip
} from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
  , SimpleProtocolHandler
} from '../basics.mjs';

 import {
     StaticNode
  , DynamicTag
  , StaticTag
  , UICheckboxOrEmptyInput
  , collapsibleMixin
} from '../generic.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    FontSelect
} from '../font-loading.mjs';

 import {
    timeControlModelMixin
  , AnimationTGenerator
 }  from '../animation-fundamentals.mjs';

import {
    culoriToColor
  , getColorFromPropertyValuesMap
  , colorToCulori
} from '../color.mjs';

import {
  converter as culoriConverter
} from '../../vendor/culori/bundled/culori.mjs';

import {
     createActor
} from '../actors/actors-base.mjs';

import {
     activatableActorTypes
   , getActorWidgetSetup
} from '../actors/available-actors.mjs';

import {
    getRegisteredPropertySetup
  , isInheritingPropertyFn
} from '../registered-properties.mjs';

import {
    COLOR
  , ProcessedPropertiesSystemMap
} from '../registered-properties-definitions.mjs';

import {
    genericTypeToUIElement
} from '../type-driven-ui.mjs';

import {
    UICharGroupContainer
} from '../ui-char-groups.mjs';

import {
    UIColorChooser
} from '../ui-color-chooser.mjs';

import {
    DATA_TRANSFER_TYPES
} from '../data-transfer-types.mjs';

import {
    initAnimanion
  , UITimeControl
} from './stage-and-actors.mjs';

import {
    UIReactTimeControl
} from '../react-time-control/';

import {
    ContainerMeta
} from '../actors/actors-meta.mjs';

import {
    setAxisLocationValue
  , AvailableAxesMathItemTypesModel
  , availableAxesMathItemTypes
  , AxesMathLocationsSumModel
  , createAxesMathItem
  , applyAxesMathLocations
  , UIAxesMath
} from '../axes-math.mjs';

const VideoproofArrayV2ActorModel = activatableActorTypes.get('VideoproofArrayV2ActorModel').get('typeClass').value;
const _NOTDEF = Symbol('_NOTDEF');

class UIVideoproofArrayLayer extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const localMainElement = widgetBus.domTool.createElement('div', {'class': 'ui-videoproof_array-layer'})
          , zones = new Map([..._zones, ['main', localMainElement]])
          ;
        super(widgetBus, zones);
        this.element = localMainElement;
        this._insertElement(this.element);
        // updateDefaultsDependencies is relative to the UIColorChooser
        // children in this case. The actual address is the same as
        // this.widgetBus.rootPath
        //      (e.g. "/activeState/videoproofArrayV2/activeActors/0/instance")
        // The three levels up are e.g. the "./keyMoments/0/textColor"
        const updateDefaultsDependencies = [
                [`animationProperties@./../../../`, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          ;
        const widgets = [
            [
                {zone: 'main'}
              , [
                    ['font', 'data']
                ]
              , DynamicTag
              , 'span', {}
              , font=>font.nameVersion
            ]
          , [
                {
                    // rootPath: widgetRootPath
                    //,
                    zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                    ['/availableFonts', 'options']
                  , ['localActiveFontKey', 'activeFontKey']
                ]
              , FontSelect
              , true
            ]
            // these are in the keyMoments!...
            // Should either be set in keyMoments[0] or in the
            // VideoproofArrayV2CellActorModel which would then
            // have to inherit it to the keyMoments as defaults.
            // using keyMoments[0] seems like a lesser effort at the moments.
            // But we need to create keyMoments[0] when the actor is created.
            // textColor
            // backgroundColor
           , [
                {
                    rootPath: Path.fromParts('.', 'keyMoments', '0', 'textColor')
                }
              , []
              , UIColorChooser
              , zones
              , 'Text Color'
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
              , this._getDefaults.bind(this, ProcessedPropertiesSystemMap.createSimpleRecord(COLOR, 'textColor'), 'textColor')
              , updateDefaultsDependencies
              , requireUpdateDefaults
            ]
          , [
                {
                    rootPath: Path.fromParts('.', 'keyMoments', '0', 'backgroundColor')
                }
              , []
              , UIColorChooser
              , zones
              , 'Background Color'
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
              , this._getDefaults.bind(this, ProcessedPropertiesSystemMap.createSimpleRecord(COLOR, 'backgroundColor'), 'backgroundColor')
              , updateDefaultsDependencies
              , requireUpdateDefaults
          ]
        ];
        this._initWidgets(widgets);
    }

    // in [ProtocolHandler animationProperties@].
    _getDefaults(ppsRecord, modelFieldName, defaultVal=_NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const {fullKey} = ppsRecord
           , liveProperties = this.getEntry('animationProperties@')
           , activeKey =  '0'//this.widgetBus.rootPath.parts.at(-1)
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(ppsRecord.prefix === COLOR) {
            const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
            if(color !== null)
                return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(fullKey, defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal
                    );
            return fallback === defaultVal
                ? defaultVal
                : fallback.default
                ;
        }
        else if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
    }
}

class UIButton extends _BaseComponent {
    // jshint ignore: start
    static TEMPLATE = `<button class="ui_button"><!-- insert: label --></button>`;
    // jshint ignore: end
    constructor(widgetBus, label, eventHandlers=[], options={title:null, classPart:null, elementAttributes: []}) {
        super(widgetBus);
        [this.element] = this._initTemplate(label, eventHandlers, options);
    }
    _initTemplate(label, eventHandlers, {title, classPart, elementAttributes}) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);
        for(const args of eventHandlers)
            element.addEventListener(...args /* e.g.: ['click', onClickFn, true] */);
        if(classPart !== null && classPart !== undefined)
            element.classList.add(`ui_button-${classPart}`);
        if(title !== null && title !== undefined)
            element.title = title;
        if(elementAttributes !== null && elementAttributes !== undefined)
            for(const [name, value] of elementAttributes)
                element.setAttribute(name, value);
        this._insertElement(element);
        return [element];
    }
}

/**
 * Wrapper for UIVideoproofArrayLayer with augmented controls to
 * move(reorder)/delete
 */
class UIVideoproofArrayLayerItem extends _BaseContainerComponent {
    constructor(widgetBus, _zones, eventHandlers) {
        const localMainElement = widgetBus.domTool.createElement('div', {'class': 'ui_videoproof_array_layers-item'})
          , zones = new Map([..._zones, ['main', localMainElement]])
          ;
        super(widgetBus, zones);
        this.element = localMainElement;
        this._insertElement(this.element);
        const key = widgetBus.rootPath.parts.at(-1);
        for(const [eventType, handler, ...restArgs] of eventHandlers)
            this.element.addEventListener(eventType, event=>handler(`key@@${key}`, event), ...restArgs);

        const widgets = [
            [
                  {zone: 'main'}
                , []
                , UIButton
                , '✖'
                , [['click', this._changeStateHandler((event)=>{
                        event.preventDefault();
                        const key = widgetBus.rootPath.parts.at(-1)
                          , activeActors = this.widgetBus.getEntry(widgetBus.rootPath.parent)
                          ;
                        activeActors.delete(key);
                        if(activeActors.size === 1) {
                            // unset the text color so it is the default
                            // black color. This behavior may be annoying
                            // for some users in some cases: wanting to
                            // keep the textColor. However, it kind of
                            // is in sync with the behavior of setting these
                            // colors. Maybe we need a trigger or not-trigger
                            // for it, e.g. to press a modifier key when
                            // deleting.
                            getDraftEntry(activeActors, './0/instance/keyMoments/0/textColor/colorTypeKey').value = ForeignKey.NULL;
                        }
                    })
                    , true]]
                , {title: 'Remove', classPart: 'remove'}
            ]
          , [
                  {zone: 'main'}
                , []
                , UIButton
                , '⇵'
                , [
                      ['dragstart', this._dragstartHandler.bind(this)]
                    , ['dragend', this._dragendHandler.bind(this)]
                  ]
                , {title: 'Move', classPart: 'move', elementAttributes: [['draggable', 'true']]}
            ]
          , [
                {   zone: 'main'
                  , rootPath: Path.fromParts('.', 'instance')
                }
              , [
                    'animationProperties@'
                ]
              , UIVideoproofArrayLayer
              , zones
            ]
        ];
        this._initWidgets(widgets);
    }
    _dragstartHandler(event) {
        const key = this.widgetBus.rootPath.parts.at(-1)
          ,  path = Path.fromParts('.', key)
          ;
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_PATH, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${DATA_TRANSFER_TYPES.ACTOR_PATH}: ${path}]`);
        event.currentTarget.parentElement.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(event.currentTarget.parentElement, 0 , 0);
    }
    _dragendHandler(event) {
        event.currentTarget.parentElement.classList.remove('dragging');
    }
}

class UIVideoproofArrayLayersController extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, ...customArgs) {
        super(widgetBus, zones);
        this._customArgs = customArgs;
    }
    _createWrapper(rootPath) {
        const settings = {
               rootPath: rootPath
             , zone: 'main'
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = UIVideoproofArrayLayerItem
          , args = [this._zones, ...this._customArgs]
          , childWidgetBus = this._childrenWidgetBus
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class UIVideoproofArrayLayers extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const localZoneElement = widgetBus.domTool.createElement('fieldset', {'class': 'ui_videoproof_array_layers'})
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_videoproof_array_layers-items'})
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        super(widgetBus, zones);
        collapsibleMixin(localZoneElement, 'legend');
        this._insertElement(localZoneElement);
        this._dropTargetElement = childrensMainZoneElement;

        this._dropTargetElement.addEventListener('dragenter', this._dragenterHandler.bind(this));
        this._dropTargetElement.addEventListener('dragover', this._dragoverHandler.bind(this));
        this._dropTargetElement.addEventListener('drop', this._dropHandler.bind(this));
        this._dropTargetElement.addEventListener('dragleave', this._dragleaveHandler.bind(this));

        this._removeDragIndicatorTimeoutId = null;
        const widgets = [
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , [label]
            ]
          , [
                {zone: 'local'}
              , []
              , StaticNode
              , childrensMainZoneElement
            ]
          , [
                // If there's just one layer.
                {
                    zone: 'main'
                    // FIXME: These activationTest functions run a lot during
                    // animation, maybe that can be changed or this widget
                    // can check on update only when activeActors changes instead.
                  , activationTest: ()=>{
                        const activeActors = widgetBus.getEntry(widgetBus.rootPath);
                        return activeActors.size === 1;
                    }
                  , rootPath: Path.fromParts('.', '0', 'instance')
                  , id: 'Layer'
                }
              , [
                    'animationProperties@'
                ]
              , UIVideoproofArrayLayer
              , zones
            ]
          , [
                // If there are more than one layers
                {
                    zone: 'main'
                  , activationTest: ()=>{
                        const activeActors = widgetBus.getEntry(widgetBus.rootPath);
                        return activeActors.size > 1;
                    }
                  , id: 'LayersController'
                }
              , [
                    ['.', 'collection']
                ]
              , UIVideoproofArrayLayersController
              , zones
              , [
                //    ['dragenter', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                //  , ['dragover', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                //  , ['drop', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                ]
            ]
          , [
                  {zone: 'local'}
                , []
                , UIButton
                , '+'
                , [['click', this._changeStateHandler((event)=>{
                        // FIXME: should get the font to use from a <select>
                        event.preventDefault();
                        const activeActors = this.widgetBus.getEntry(widgetBus.rootPath) // activeActors
                        insertNewCellActorModel(activeActors);
                    })
                    , true]]
                , {title: 'Add', classPart: 'add'}
            ]
        ];
        this._initWidgets(widgets);
    }

    // FIXME: Straight copy from StageManager: should be a shared thing.
    // The allowed DATA_TRANSFER_TYPES array could be an argument to bind.
    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [DATA_TRANSFER_TYPES.ACTOR_PATH, DATA_TRANSFER_TYPES.ACTOR_CREATE];
        for(const type of applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    /**
     * FIXME: Mapping from DOM to Model path/key is kind of dark magic.
     * It would probably be cleaner to inject the dragHandlers into
     * the children and call them with the necessary information ammended.
     * ALso, this has very intimate knowledge about the structure of it's
     * children.
     */
    _getChildKeyFromElement(childElement) {
        const layerController = this.getWidgetById('LayersController', null);
        if(layerController !== null) {
            for(const [,childWrapper] of layerController.widgets()) {
                if(childWrapper.widget.element === childElement)
                    return childWrapper.widgetBus.rootPath.parts.at(-1);
            }
            // e.g. the parent container that listens to the event.
            return null;
        }
        const layer = this.getWidgetById('Layer', null);
        if(layer !== null)
            return '0';
        return null;
    }

    _getClosestChild(element) {
        if(element === this._dropTargetElement)
            return this._dropTargetElement;
        for(const childElement of this._dropTargetElement.children) {
            if(childElement === element || childElement.contains(element))
                return childElement;
        }
        throw new Error(`UNKOWN can't get closest child in ${this}.`);
    }

    _getDropTargetInsertPosition(event) {
        const result = {targetElement: null, childKey: null, insertPosition: null};
        // NOTE: node.contains(node) === true
        if(this._dropTargetElement.contains(event.target)) {
            const targetElement = this._getClosestChild(event.target);
            result.targetElement = targetElement;
            result.childKey = this._getChildKeyFromElement(targetElement);
        }
        else
            throw new Error(`VALUE ERROR event.target can't be mapped to ${this}.`);


        const {height, top} = result.targetElement.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = 0.5
          // = item.isEmptyLayerItem
          //       // Move this line below the empty layer container <ol> active
          //       // zone, such that we don't get undecided flickering between
          //       // the empty container zone and the item above: the <li> that
          //       // contains the empty children <ol>.
          //       ? 0.8
          //       : 0.5
          ;
        result.insertPosition = relativeY < testPosition ? 'before' : 'after';
        return result;
    }

    _setDropTargetIndicator({insertPosition=null, targetElement=null}={}) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of [this._dropTargetElement, ...this._dropTargetElement.querySelectorAll(`.${markedClass}`)]) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for(const name of [...elem.classList]) {
                if(name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if(insertPosition === null)
            return;

        if(!['before', 'after', 'insert'].includes(insertPosition))
            throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            // return;

        const [elem, posClassSuffix] = this._dropTargetElement !== targetElement
                            && insertPosition === 'before'
                            && targetElement.previousElementSibling
                ? [targetElement.previousElementSibling, 'after']
                : [targetElement, insertPosition]
                ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dropIndicatorForDragHandler(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                  // TODO: not yet used in this context
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(event);
        this._setDropTargetIndicator(insertPosition);
    }

    _dragoverHandler(event) {
        return this._dropIndicatorForDragHandler(event);
    }

    _dragenterHandler(event) {
        return this._dropIndicatorForDragHandler(event);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const {setTimeout} = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this), 100);
    }

    _dropHandler(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(); // remove indicator
        const {childKey:targetKey, insertPosition} = this._getDropTargetInsertPosition(event);

        if(type === DATA_TRANSFER_TYPES.ACTOR_PATH) {
            const sourcePath = Path.fromString(event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH))
              , sourceKey = sourcePath.parts.at(-1)
              ;
            return this._move(sourceKey, targetKey, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.ACTOR_CREATE) {
            const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_CREATE);
            return this._create(typeKey, targetKey, insertPosition);
        }
    }

    _create(typeKey, targetKey, insertPosition){
        throw new Error(`NOT IMPLEMENTED ${this}._create for type ${typeKey} at ${insertPosition}#{targetKey}.`);
    }

    _move(sourceKey, targetKey, insertPosition) {
        if(sourceKey === targetKey)
            return; // nothing to do

        return this._changeState(()=>{
            const activeActors = this.widgetBus.getEntry(this.widgetBus.rootPath)
              , source = activeActors.get(sourceKey)
              , targetIndex = targetKey === null
                        ? (insertPosition === 'after' ? activeActors.size : 0)
                        : parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;
            if(sourceIndex === targetIndex)
                return;// nothing to do

            let insertIndex;
            if(insertPosition === 'after')
                insertIndex =targetIndex + 1;
            else if(insertPosition === 'before')
                insertIndex = targetIndex;
            else
                throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

            if(sourceIndex < targetIndex)
                // by the time we insert, sourceIndex is already removed from before
                insertIndex = insertIndex - 1;
            activeActors.delete(sourceKey);
            activeActors.splice(insertIndex, 0, source);
        });
    }
}

const VideoproofArrayV2Model = _BaseLayoutModel.createClass(
        'VideoproofArrayV2Model'
      , ...timeControlModelMixin
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableAxesMathItemTypes'
                      , AvailableAxesMathItemTypesModel
                      , availableAxesMathItemTypes
                      )
        // As an entry point, the AxesMathLocationsSumModel can handle
        // all the other items and it doesnt't alter them, it also
        // enables an UI that doesn't has to be special compared
        // to a deeper nested version.
        // However, we'll want to refine the axis math framing conditions
        // such as a way of setting defaults in a post-calculation way
        // so eventually there'll be another struct containing this.
        // ALSO: a CoherenceFunction should take care that if this is
        // empty, a default value should be set, that creates a list of
        // key moments. Having an indeed empty list could be achieved by
        // putting an empty list into this.
      , ['axesMath', AxesMathLocationsSumModel]
      , CoherenceFunction.create(
            ['axesMath']
          , function initAxesMath({axesMath}) {
            // Not sure about this, mabe there can be a default
            const items = axesMath.get('items');
            if(items.size === 0) {
                console.log('VideoproofArrayV2ActorModel axesMath is empty. adding some content');
                const locationsProductItem = createAxesMathItem('LocationsProduct', items.dependencies)
                  , locationSets = getEntry(locationsProductItem, './instance/axesLocationValuesMap')
                  ;

                for(const [axisTag, locationsVals] of [
                            ['opsz', ['min', 'default', 'max']]
                          , ['wdth', ['default', 'min', 'max']]
                          , ['wght', ['default', 'min', 'max']]]) {
                    if(!locationSets.has(axisTag)) {
                        locationSets.set(
                            axisTag
                          , locationSets.constructor.Model.createPrimalDraft(locationSets.dependencies)
                        );
                    }
                    const locationValues = locationSets.get(axisTag);

                    for(const locationRawValue of locationsVals) {
                        const axisLocationValue = locationValues.constructor.Model.createPrimalDraft(locationValues.dependencies);
                        setAxisLocationValue(axisLocationValue, locationRawValue);
                        // single locations items:
                        //      {'opsz': 'default'}
                        //      {'opsz': 'min'}
                        //      {'opsz': 'max'}
                        //      {'wdth': 'default'}
                        //      {'wdth': 'min'}
                        //      {'wdth': 'max'}
                        //      {'wght': 'default'}
                        //      {'wght': 'min'}
                        //      {'wght': 'max'}
                        //
                        // otherwise we could also have
                        //      {'opsz': 'default', 'wdth': 'default', 'wght': 'default'}
                        //      {'opsz': 'min', 'wdth': 'min', 'wght': 'min'}
                        //      {'opsz': 'max', 'wdth': 'max', 'wght': 'max'}
                        // but currently it's not possible to do and not planned:
                        //      {'opsz': 'default', 'opsz': 'min', 'opsz': 'max'}
                        //      {'wdth': 'default', 'wdth': 'min', 'wdth': 'max'}
                        //      {'wght': 'default', 'wght': 'min', 'wght': 'max'}
                        //
                        // I'm thinking another way to encode this may be
                        // a list of [tag, value] pairs. It's not "locations"
                        // then anymore though. [tag, value] enables all
                        // of the above. Locations with a single key, value
                        // in a list, i.e. like the first example, are just
                        // like [tag, value]
                        //
                        // However, the timeslist will ideally show a summary
                        // similar to the last entry, derrived from either
                        // the first or the seccond form:
                        //       opsz default, min, max
                        //     × wdth default, min, max
                        //     × wght default, min, max X
                        locationValues.push(axisLocationValue);
                    }
                }
                items.push(locationsProductItem);
            }
        })
      , ['videoproofArrayV2', VideoproofArrayV2ActorModel]
      , CoherenceFunction.create(
            ['videoproofArrayV2' , 'font', /*'duration', 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function initVideoproofArray({videoproofArrayV2: videoproofArray, font}) {
            // always a loop
            videoproofArray.get('isLoop').value = true;
            const keyMoments = videoproofArray.get('keyMoments')
              , KeyMomentModel = keyMoments.constructor.Model
              , needInitialKeymoment = keyMoments.size === 0
                // Very nice that we can detect this here.
                // The videoproofArray.dependencies could also be set
                // e.g. by a user interface and it could confuse this
                // detection heuristic, however, we don't plan to
                // do this.
              // , fontHasChanged = videoproofArray.dependencies.font !== font
              // , needNewKeyMoments = needInitialKeymoment || fontHasChanged
              ;

            if(videoproofArray.get('localActiveFontKey').value !== font.value.fullName) {
                // Set font explicitly, to make the VideoproofArrayV2ActorModel
                // self contained when copied to stage-and-actors.
                // This creates a duplication of the information in
                // the global font key, but as explained, it's intended
                // as a feature: make a self-contained actor.
                videoproofArray.get('localActiveFontKey').set(font.value.fullName);
            }

            if(needInitialKeymoment) {
                // This is initial. We'll always require a keyMoment  at 0
                const newKeyMoment = KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
                  , defaultCharGroup = KeyMomentModel.fields.get('charGroup').fields.get('options').Model.defaultValue
                  ;
                newKeyMoment.get('charGroup').get('options').set(defaultCharGroup);
                keyMoments.push(newKeyMoment);
                console.log('CoherenceFunction setDefaultsVideoproofArray videoproofArrayV2', videoproofArray, 'keyMoments', keyMoments);
            }
        })
      , CoherenceFunction.create(
            ['videoproofArrayV2']
          , function initEmptyActiveActors({videoproofArrayV2}) {
            const activeActors = videoproofArrayV2.get('activeActors')
            //  , availableActorTypes = videoproofArrayV2.get('availableActorTypes')
              ;
            if(activeActors.size === 0) {
                console.log('VideoproofArrayV2Model initEmptyActiveActors activeActors is empty. adding VideoproofArrayV2CellActorModel');
                insertNewCellActorModel(activeActors);
            }
        })
      , CoherenceFunction.create(
            ['videoproofArrayV2', 'axesMath', 'installedFonts', 'font', 'duration']
          , function* updateRap({videoproofArrayV2, axesMath, installedFonts, font, duration}) {
            // how to know when to update?
            // I think whenever axesMath
            // but likely also whenever any of the fonts have changed
            // especially because we'll have to create keyMoments for
            // each actor.
            //
            // seems like when an item has changed it comes here as
            // a non-draft item, if it has not changed, it comes as
            // an proxy.
            // When all items are proxies, there have been no changes
            // this is important, as when only t changes we don't want
            // to cause any work ideally.
            //
            // videoproofArrayV2 seems to be always a draft
            const activeActors = videoproofArrayV2.get('activeActors')
              , fontHasChanged = videoproofArrayV2.dependencies.font !== font
              ;
            //  , availableActorTypes = videoproofArrayV2.get('availableActorTypes')
            // console.log('updateRap',
            //     // when only t changed:
            //     //      isProxy: true isDraft: true
            //     // added an actor:
            //     //       isProxy: false isDraft: true
            //     // changed axesMath
            //     //       isProxy: true isDraft: true
            //     // global font changed (is a dependency)
            //     //       isProxy: true isDraft: true
            //     '\nvideoproofArrayV2:', videoproofArrayV2, 'isProxy:', _PotentialWriteProxy.isProxy(videoproofArrayV2), 'isDraft:',  videoproofArrayV2.isDraft
            //     // when only t changed:
            //     //      isProxy: true isDraft: false
            //     // added an actor:
            //     //       isProxy: false isDraft: true
            //     // changed axesMath
            //     //       isProxy: true isDraft: false
            //     // global font changed (is a dependency)
            //     //       isProxy: true isDraft: false
            //   , '\nactiveActors:', activeActors, 'isProxy:', _PotentialWriteProxy.isProxy(activeActors), 'isDraft:',  activeActors.isDraft
            //     // when only t changed:
            //     //      isProxy: true isDraft: false
            //     // added an actor:
            //     //       isProxy: true isDraft: false
            //     // changed axesMath
            //     //       isProxy: false isDraft: true
            //     // global font changed (is NOT a dependency)
            //     //       isProxy: true isDraft: false
            //   , '\naxesMath:', axesMath, 'isProxy:', _PotentialWriteProxy.isProxy(axesMath), 'isDraft:',  axesMath.isDraft
            // );
            // if(activeActors.isDraft) {
            //     for(const [key, actor] of activeActors) {
            //         // can I detect which actor changed font
            //         // OR is new -> these don't appear as actor.isDraft === true
            //         // OR if there was an actor deleted? => though this
            //         //    likely doesn't require an update!
            //         //
            //         // font/color etc. changed: isProxy false isDraft: true
            //         const instance = actor.get('instance')
            //           , localActiveFontKey = instance.get('localActiveFontKey')
            //           ;
            //         console.log(`actor #${key}:`, actor, 'isProxy:', _PotentialWriteProxy.isProxy(actor), 'isDraft:',  actor.isDraft
            //           , '\n instance:', instance
            //             // NICE! we can detect when these changed!
            //             // font changed: isProxy: false isDraft: true
            //             // color changed: isProxy: true isDraft: false
            //             //
            //             // BUT this heuristic is maybe not totally bomb proof
            //             // if there's a complete replacement of the active
            //             // actors list, these actors will all not look
            //             // like new ones!
            //             // however, maybe if we detect if any other
            //             // property changed, that is not localActiveFontKey
            //             // we can assume that this has no changed font
            //             // if nothing changed
            //           , `\nlocalActiveFontKey ${localActiveFontKey.value.toString()}`, localActiveFontKey, 'isProxy:', _PotentialWriteProxy.isProxy(localActiveFontKey), 'isDraft:',  localActiveFontKey.isDraft
            //           , 'oldState:', localActiveFontKey.isDraft && localActiveFontKey.oldState.value || '(No old state)'
            //         );
            //     }
            // }
            if(activeActors.isDraft || axesMath.isDraft || fontHasChanged) {
                // Not a bomb proof heuristic but hopefully good enough
                // for this use case.
                const videoproofArrayDraft = unwrapPotentialWriteProxy(videoproofArrayV2, 'draft');
                yield *applyAxesMathLocations(
                        videoproofArrayDraft
                      , axesMath/* AxesMathLocationsSumModel */
                      , installedFonts, font, duration
                );
            }
        })
    )
  ;

export class UIAlignment extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_alignment">
    <label class="radio-main-label">Cell-Alignment</label>
</div>`
    static TEMPLATE_OPTION = `<label class="ui_alignment-radio_label">
        <input name="alignment" type="radio">
        <span class="ui_alignment-radio_icon"></span></label>`
    //jshint ignore:end
    constructor(widgetBus, getDefault) {
        super(widgetBus);
        this._getDefault = getDefault;
        [this.element, this._inputs] = this._initTemplate();
    }

    _initTemplate() {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , inputs = new Map()
          ;
        for(const [align, labelText] of [
                        ['left', 'Left']
                      , ['center', 'Center']
                      , ['right', 'Right']
                    ]) {
            const elem = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE_OPTION).firstElementChild
              , input = elem.querySelector('input')
              ;
            elem.append(labelText);
            input.classList.add(`ui_alignment-${align}`);
            input.addEventListener('change', this._changeStateHandler.bind(this, align));
            inputs.set(align, input);
            container.append(elem);
        }
        this._insertElement(container);
        return [container, inputs];
    }

    _changeStateHandler(align/*, event*/) {
        this._changeState(()=>this.getEntry('value').value = align);
    }

    update(changedMap) {
        if(changedMap.has('value')) {
            const alignModel = changedMap.get('value')
              , align = alignModel.isEmpty
                    ? this._getDefault()
                    : alignModel.value
                    ;
            for(const [key, input] of this._inputs)
                input.checked = key === align;
        }
    }
}


function _extractFirstKeyMomentTextColorHueValues(activeActors) {
    const firstKeyMomentTextColorPath = Path.fromParts('.', 'instance', 'keyMoments', '0', 'textColor', 'instance')
     , hueValues = []
     ;
    for(const [/*key*/, actor] of activeActors) {
        const readOnlyActor = unwrapPotentialWriteProxy(actor)
          , firstKeyMomentTextColor = getEntry(readOnlyActor, firstKeyMomentTextColorPath)
          ;
        if(!firstKeyMomentTextColor.hasWrapped)
            // ignore: has no value
            continue;
        const culoriColor = colorToCulori(firstKeyMomentTextColor)
            // just in case it's a different mode
          , culoriColorOKLCH = culoriConverter('oklch')(culoriColor)
          ;
          // CAUTION:  Achromatic colors (shades of gray) will have an undefined hue.
        if(culoriColorOKLCH.h !== undefined)
            hueValues.push(culoriColorOKLCH.h);
    }
    return hueValues;
}

/**
 * This is an algorith to find hue values for comparison layer colors.
 * It is set up to produce a bluish value then a pinkish value then more
 * colors with a similar distance (HUE_STRIDE), unless the available
 * gaps between the hues get to small for the stride size, then the center
 * of the first biggest gap is used.
 *
 * The color progression if layer colors are changed or if existing layers
 * are deleted is dynamic, but the hue distance between colors should always
 * be good. More than three layers for the intended font comparison use case
 * seems extreme though.
 *
 * only looks at each actors KeyMoments[0] textColor
 */
function _getNextHueValueTurns(...hueValues) {
    // 0.55: blue <= INITIAL_HUE, HUE_STRIDE 2/5, HUE_STRIDE_MIN_GAP_SIZE 0.55
    // 0.95: pink
    // 0.35: green
    // Then centering strategy between gaps:
    // 0.1499: orange
    // 0.3999: darker blue/violet
    // 0.05: strong pink
    // 0.45: turquoise
    // 0.25: yellow
    const INITIAL_HUE = 0.55 // .55
       // geting started with something smaller than 0.5
     , HUE_STRIDE = 2/5
       // the next value will be + HUE_STRIDE if there's a
       // gap with at least HUE_STRIDE_MIN_GAP_SIZE, this is to
       // ensure the distnce to the next value is "big enough" when
       // HUE_STRIDE is applied. Otherwise, gaps will be filled using the
       // center position,
     , HUE_STRIDE_MIN_GAP_SIZE = HUE_STRIDE + HUE_STRIDE * 0.5 - 0.05
     ;
    // console.log('RAW hueValues:', ... hueValues);
    if(hueValues.length === 0)
        return INITIAL_HUE;

    // rotate to start at firstValue
    const firstValue = hueValues[0]; // before sort
        // We're only trying to find the first biggest gap, duplicates
        // could be filtered, but if the gap is 0 there's somewhere a
        // bigger gap anyways.
    hueValues.sort();// ==> ascending
    // console.log('hueValues sorted', ...hueValues);
    const start = hueValues.indexOf(firstValue);
    // Rotate so that we start looking at the first gap in order,
    // the other gaps are not ordered anymore.
    hueValues.splice(0, Infinity, ...hueValues.slice(start), ...hueValues.slice(0, start));

    // console.log('hueValues rotated', ...hueValues);
    const biggestGap = [];
    for(const [i, val] of hueValues.entries()) {
        const nextI = hueValues.length > i+1
                    ? i + 1
                    : 0
          , nextValRaw = hueValues.at(nextI)
          // , nextVal = nextValRaw < val
          //       ? nextValRaw + 1
          //       : nextValRaw
          , gapRaw = nextValRaw - val
          , gap = gapRaw < 0 ? gapRaw + 1 : gapRaw
          ;
        // console.log(`hueValues i: ${i}, val: ${val}, nextI: ${nextI}, nextValRaw: ${nextValRaw}, gap: ${gap}`);
        if(biggestGap.length === 0 || biggestGap[1] < gap)
            biggestGap.splice(0, Infinity, i, gap === 0 ? 1 : gap);
    }
    // console.log('biggestGap', ...biggestGap);

    const [i, gap] = biggestGap
    , nextHueDistance = (gap >= HUE_STRIDE_MIN_GAP_SIZE)
        ? HUE_STRIDE
        : gap * 0.5 // center strategy
    , newHue = (hueValues[i] + nextHueDistance) % 1
    ;
    // console.log('newHue', newHue, 'strategy:', (gap >= HUE_STRIDE_MIN_GAP_SIZE) ? 'HUE_STRIDE' : 'CENTER');
    return newHue;
}

function getNextHueValueTurns(activeActors) {
    const hueValues = _extractFirstKeyMomentTextColorHueValues(activeActors);
    return _getNextHueValueTurns(...hueValues.map(deg=>deg/360));
}

// Algorithm for hue spacing.
function getNextHueValueDeg(activeActors) {
    const nextHueInTurns = getNextHueValueTurns(activeActors);
    return nextHueInTurns * 360;
}

function createCellActorModel(activeActors, setColor=true) {
    const cellActorModel = createActor('VideoproofArrayV2CellActorModel', activeActors.dependencies)
        // create keyframe [0] as it is used as the base for per layer
        // custom properties.
      //, cellActorModelInstance = cellActorModel.get('instance')
      //, keyMoments = cellActorModelInstance.get('keyMoments')
      , keyMoments = getDraftEntry(cellActorModel, 'instance/keyMoments')
      , KeyMomentModel = keyMoments.constructor.Model
      , newKeyMoment = KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
      ;
    if(setColor) {
        // set textColor to newKeyMoment ...
        // Get all colors from the first keyMoments in activeActors
        // and set the color evenly spaced, by an algortihm.
        const culorijsColor = {
                mode: 'oklch'
              , l: .7   // 1=== full
              , c: 0.4 // 0.4 === full
              , h: getNextHueValueDeg(activeActors) // 360 === full
              , alpha: .6
          }
          , color = culoriToColor(culorijsColor, newKeyMoment.dependencies)
          ;
        newKeyMoment.set('textColor', color);
    }
    keyMoments.push(newKeyMoment);
    return cellActorModel;
}

/**
 * There's a UX twist:
 * The first cellActorModel will not have a color set, so it's the default
 * color, which is black.
 * The second cellActorModel will cause the color of the first cellActorModel
 * be set, if it is not set explicitly yet. This will cause some confusion
 * but hopefully will overall create satisfactory results.
 * The behavior is:
 *      one layer: black
 *      two layers: blue, pink
 * It may be nice, to remove the blue(?) again, once there's only one layer
 * left, however, the heuristic is hard to generalize. It may not be blue.
 * It also is explicitly set, so it may be meant to stay explicitly.
 */
function insertNewCellActorModel/*AndManageTextColor*/(activeActors) {
    if(activeActors.size === 1) {
        const firstKeyMoment = getDraftEntry(activeActors, './0/instance/keyMoments/0')
          , firstKeyMomentTexColor = getEntry(firstKeyMoment, './textColor/instance')
          ;
        // if the textColor of the first actor, first keyMoment, is not set
        if(!firstKeyMomentTexColor.hasWrapped) {
            const cellActorModel = createCellActorModel(activeActors, true)
               , textColor = getEntry(cellActorModel, './instance/keyMoments/0/textColor')
               ;
            firstKeyMoment.set('textColor', textColor);
        }
    }
    const setColor = activeActors.size > 0 // set no color for initial actor
      , cellActorModel = createCellActorModel(activeActors, setColor)
      ;
    activeActors.push(cellActorModel);
}

class VideoproofArrayV2Controller extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const generalControlsContainer = widgetBus.domTool.createElement('fieldset')
          , zones = new Map([..._zones, ['general', generalControlsContainer]])
          ;
        super(widgetBus, zones);

        collapsibleMixin(generalControlsContainer, 'legend');

        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('animationProperties@'));
        // original: this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // old: const animationPropertiesKey = widgetBus.rootPath.append('videoproofArrayV2').toString()
        const animationPropertiesRelativePath = Path.fromParts('.','videoproofArrayV2')
          , animationPropertiesPath = this.widgetBus.rootPath.append(...animationPropertiesRelativePath)
            // This is not used via dependencyMapping, hence the path must be relative...
            // FIXME: This is a very good example having to track the paths
            // however, it can only be problematic in the stage-and-actors
            // case, as the layout, this example!!!, doesn't move the videoproofArrayV2
            // model around.
          , animationPropertiesKey = `animationProperties@${animationPropertiesPath}`
          , updateDefaultsDependencies = [
                [animationPropertiesKey, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          , propertyRoot = 'generic/charGroup/'
         ;

        this._animationPropertiesKey = animationPropertiesKey;
        // animationProperties@/activeState/videoproofArrayV2
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {
                    rootPath: animationPropertiesRelativePath
                }
              , [
                    ['../t', 'globalT'], 'keyMoments', 'isLoop'
                ]
              , ContainerMeta
              , zones
              , initAnimanion
              , isInheritingPropertyFn
            ]
          , [
                {zone: 'main'}
              , []
              , UITimeControl
              , zones
            ]
          , [
                {zone: 'main'}
              , ['t', 'playing', 'duration']
              , UIReactTimeControl
            ]
          , getActorWidgetSetup({
                typeKey: 'VideoproofArrayV2' // ?
              , typeLabel: 'Videoproof Array V2' // ?
              , typeClass: VideoproofArrayV2ActorModel
                // Same as for the previous VideoproofArray, i.e. looking at the same data.
              , widgetRootPath: widgetBus.rootPath.append('videoproofArrayV2')
              , zones: new Map([...zones, ['layer', zones.get('layout')]])
              , get layerBaseClass() {throw new Error('NOT IMPLEMENTED get layerBaseClass');}
              , getActorWidgetSetup() {throw new Error('NOT IMPLEMENTED getActorWidgetSetup');}
            })
          , [
                {
                    zone: 'main'
                  , rootPath: Path.fromParts('.', 'videoproofArrayV2', 'activeActors')
                }
              , []
              , UIVideoproofArrayLayers
              , zones
              , 'Family Comparison'
            ]
          , [
                // Doing it this way, we can eventually copy just the
                // videoproofArrayV2 model and by that inherit the whole
                // actor settings. Alternativeley, a parent element could
                // set the basic properties, and we'd have to copy these
                // properties and insert them correctly into the target.
                // This way, videoproofArrayV2 is self contained.
                {
                    zone: 'main'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0', 'charGroup')
                }
              , []
              , UICharGroupContainer
              , zones
                // FIXME: "injectable" => this must update paths as well!
              , {
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2771
                    updateDefaultsDependencies
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2775
                  , requireUpdateDefaults
                  , genericTypeToUIElement
                    // get: not implemented: UICharGroupContainer http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2955
                    // use: not implemented:  _activateCustom http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:3020
                    // Uncaught (in promise) Error: not implemented: get getDefaults(prefix:string:generic/charGroup, key:string:options, defaultVal:object:null)
                  , getDefaults: this._getDefaults.bind(this)
                }
              , propertyRoot
              , 'Glyphs'
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , generalControlsContainer
            ]
          , [
                {zone: 'general'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Options'
            ]
          , [
                {
                    zone: 'general'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0')
                }
              , [
                    ['cellAlignment', 'value']
                ]
              , UIAlignment
              , ()=>getRegisteredPropertySetup('generic/cellAlignment').default
            ]
          , [
                {
                    zone: 'general'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0', 'stageBackgroundColor')
                }
              , []
              , UIColorChooser
              , zones
              , 'Background Color'
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
              , this._getDefaults.bind(this, ProcessedPropertiesSystemMap.createSimpleRecord(COLOR, 'stageBackgroundColor'), 'stageBackgroundColor')
              , updateDefaultsDependencies
              , requireUpdateDefaults
            ]
          , [
                {
                    zone: 'general'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0')
                }
              , [
                    ['showCellBoxes', 'value']
                ]
              , UICheckboxOrEmptyInput
              , ()=>getRegisteredPropertySetup('generic/showCellBoxes').default
              , requireUpdateDefaults
              , 'show_cell_boxes'
              , 'Show Cell Boxes'
            ]
          , [
                {
                    zone: 'main'
                    // rootPath maybe don't alter rootPath now, as
                    //  ['axesMath', AxesMathLocationsSumModel] is top level
                    // in VideoproofArrayV2Model at the moment.
                    // will perhaps move into a dedicated struct though

                }
              , [
                    // TODO:
                    // ['videoproofArrayV2/keyMoments', 'keyMoments']
                    // actually, font may not be that interesting, but
                    // all the current videoproofArrayV2 layer fonts are
                    // VideoproofArrayV2CellActorModel in  videoproofArrayV2/activeActors
                    // ['videoproofArrayV2/activeActors', 'layers']
                    //     => which properties do we need to look at despite
                    //        of fonts? I don't think there's much.
                    //        The fonts will lead to the keyMoments being
                    //        updated.
                    // , ['../font', 'font']
                ]
              , UIAxesMath
              , zones
              , 'Rap Editor'
              , updateDefaultsDependencies
            ]
        ];
        this._initWidgets(widgets);
    }
    _getDefaults (ppsRecord, modelFieldName, defaultVal=_NOTDEF) {
        // This is similar to KeyMomentController._getDefaults
        // it should not be rewquried to always have to rewrite these.
        const {fullKey} = ppsRecord
          , liveProperties = this.getEntry(this._animationPropertiesKey)
          , activeKey = '0' // hard coded, here always the first key moment  //this.widgetBus.rootPath.parts.at(-1)
          , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
          ;

        if(ppsRecord.prefix === COLOR) {
            const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
            if(color !== null)
                return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(fullKey, defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal
                    );
            return fallback === defaultVal
                ? defaultVal
                : fallback.default
                ;
        }
        else if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);

        if(defaultVal !== _NOTDEF) {
            return defaultVal;
        }
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
    }
    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export {
    VideoproofArrayV2Model as Model
  , VideoproofArrayV2Controller as Controller
};
