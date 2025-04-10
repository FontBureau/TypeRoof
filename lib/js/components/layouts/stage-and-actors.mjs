/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , getEntry
  , StateComparison
  , CoherenceFunction
  , NumberModel
  , StaticDependency
  , FreezableSet
  , PathModelOrEmpty
} from '../../metamodel.mjs';

import {
    zip
} from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
  , _CommonContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    StaticNode
  , DynamicTag
  , StaticTag
  , UINumberInput
  , PlainNumberAndRangeOrEmptyInput
  , UINumberAndRangeOrEmptyInput
  , UILineOfTextInput
  , PlainSelectInput
  , collapsibleMixin
  , WasteBasketDropTarget
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
  , UITimeControlCircle
  , UIActorTimeControlKeyMomentSelectCircle
  , getBasicPlayerControlWidgets
  , LocalScopeAnimanion
  , binarySearch
}  from '../animation-fundamentals.mjs';

import {
    createLabelForKeyMoment
} from './example-key-moments.mjs';

import {
    UIManualAxesLocations
  , AxesLocationsModel
} from '../ui-manual-axis-locations.mjs';

import {
    ColorModel
  , getColorFromPropertyValuesMap
  , getColorModelFields
  , colorPropertyGen
} from '../color.mjs';

import {
    ActorsModel
  , AvailableActorTypesModel
  , createActor
} from '../actors/actors-base.mjs';

import {
    ContainerMeta
} from '../actors/actors-meta.mjs';

import {
    StageKeyMomentsModel
  , FontSizeModel
} from '../actors/models.mjs';

import {
    activatableActorTypes
  , getActorWidgetSetup
  , getActorTreeNodeType
  , isTypographicActorTypeKey
  , getActorTypeKeySpecificWidgets
} from '../actors/available-actors.mjs';

import {
    CONTAINER_TASK_AUTOMATIONS
} from  '../task-automations/container-task-automations.mjs';

import {
    REGISTERED_PROPERTIES
  , getRegisteredPropertySetup
  , isInheritingPropertyFn
} from '../registered-properties.mjs';

import {
    DATA_TRANSFER_TYPES
} from '../data-transfer-types.mjs';

import {
    COLOR
  , NUMERIC
  , GENERIC
  , childrenPropertiesBroomWagonGen
  , ProcessedPropertiesSystemMap
} from '../registered-properties-definitions.mjs';

import {
    StageDOMNode
}
from '../actors/stage.mjs';

import {
    ActiveActorsRenderingController
} from '../actors/active-actors-rendering-controller.mjs';

import {
    _BaseTypeDrivenContainerComponent
} from '../type-driven-ui-basics.mjs';

import {
    genericTypeToUIElement
} from '../type-driven-ui.mjs';

import {
    UIshowProcessedProperties
} from '../processed-properties.mjs'

const StageAndActorsModel = _BaseLayoutModel.createClass(
        'StageAndActorsModel'
      , ...timeControlModelMixin
         // same as in_BaseActorModel, but this is not an actor,
         // these properties are the root of the inheritance.
      , ['keyMoments', StageKeyMomentsModel]
      , CoherenceFunction.create(
            ['width', 'height'/*, 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function setDefaults({width, height /*, availableActorTypes, activeActors, font, installedFonts*/}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            //
            // widht and heigth defaults could also be determined differently
            // this is simply to get started somewhere.
            if(width.value === undefined)
                width.value = 720; // 1080;
            if(height.value === undefined)
                height.value = 720; // 1080;
        })
        // very similar to Layer, we could even think about
        // using something like ['baseLayer', LayerActorModel]
        // I'm currently thinking, this could also be a ActorsModel
        // and allow to define actors in place. Then it's only necessary
        // to put actors into availableActors when they will be used by
        // reference.
      , ['activeActors', ActorsModel]
        // ok, we need to select from somewhere an available type
        // maybe, this can be a permanent, local (injected here?) dependency
        // not one that is injected via the shell. Unless, we start to
        // add actors in a plugin-way, like it is planned for layouts ...
        // TODO:
        // FIXME: removed the type for this StaticDependency definition,
        // which would be "AvailableActorTypesModel", as it gets a direct
        // value and that is whatever type it is. It should be immutable
        // for sure.
        // FIXME: Other dependencies, however, should also be defined with
        // a type, so we can always be sure to receive the expected type.
        // Maybe also some (rust) trait-like description of required
        // fields and their types could be helpful for this, so stuff
        // can be similar but is not bound to the actual same type.
        // static dependeny could as implementation always be applied to
        // the dependencies dict after collecting external dependencies,
        // then, treat it as InternalizedDependency...
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableActorTypes'
                      , AvailableActorTypesModel
                      , activatableActorTypes
                      )
        // , ... StaticDependency.createWithInternalizedDependency(
        //                   'referencableActorTypes'
        //                 , AvailableActorTypesModel
        //                 , referencableActorTypes
        //                 )
        // , ['referencableActors', ReferencableActorsModel]
      , ['width', NumberModel]
      , ['height', NumberModel]
      , ['editingActor', PathModelOrEmpty]
    )
  ;

// So, we want to get a t value from parent, as a dependency, but give
// another t value to the child, could be done in a coherence method
// where parentT => InternalizedDependency('t', NumberModel)
//       t=>NumberModel
// and the coherence function can do something to go from parentT to t
// BUT at this point there's a discrepance between actually stored values
// and calculated values required e.g. for rendereing, and it is time to
// implement something concrete!


const _NOTDEF = Symbol('_NOTDEF'); // not directly exported on purpose

/**
 * Similar to the concept Surfaces in Cairo
 * https://www.cairographics.org/manual/cairo-surfaces.html
 * this will be the rendering target. Likely each surface will have
 * it's own capabilties. It's interesting that HTML in general and also
 * SVG can host different technologies (HTML/CSS, SVG, Canvas2d/3d)
 * so maybe we can mix these surfaces eventually as well.
 */
// class SurfaceHTML extends _BaseComponent {
//     //jshint ignore:start
//     static TEMPLATE = `<div class="surface_html">
// </div>`;
//     //jshint ignore:end
//     constructor(widgetBus) {
//         super(widgetBus);
//         [this.element] = this.initTemplate();
//     }
//
//     initTemplate() {
//         const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
//           , element = frag.firstElementChild
//           ;
//         return [element];
//     }
//
//     // activeActors
//     // width
//     // height
//     update(changedMap) {
//         changedMap.has('hello');
//     }
// }

/**
 * yield [propertyName, propertyValue]
 * derrived from axisLocationsGen
 */
function* numericPropertiesGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const numericProperties = keyMoment.get('numericProperties');
    for(const [key, property] of numericProperties)
        yield [`${NUMERIC}${key}`, property.value];
}


/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* fontSizeGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const fontSize = keyMoment.get('fontSize');
    if(!fontSize.isEmpty)
        yield [`${GENERIC}fontSize`, fontSize.value];
}

/**
 * yield [propertyName, propertyValue]
 * derrived from keyMomentPropertyGenerator
 */
function* axisLocationsGen(outerAnimanionAPI, keyMoment, momentT) {
      // fontSize = keyMoment.get('fontSize')
      // => this is interesting, if keyMoment defines fontSize, we
      //    definitely use that, otherwise, going only via
      // outerAnimanionAPI.getPropertyAtMomentT(`${GENERIC}fontSize`, momentT) will
      // yield the out-value (last value) of that momentT
      const autoOPSZ = keyMoment.get('autoOPSZ').value
      ;
    if(autoOPSZ) {
        const fontSize = keyMoment.get('fontSize')
          , fontSizeValue = fontSize.isEmpty
                  // this requires full calculation of the fontSize property animation!
                ? outerAnimanionAPI.getPropertyAtMomentT(`${GENERIC}fontSize`, momentT, null)
                : fontSize.value
          ;
        if(fontSizeValue !== null)
            yield [`axesLocations/opsz`, fontSizeValue];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = keyMoment.get('axesLocations');
    for(const [axisTag, axisValue] of axesLocations) {
        if(autoOPSZ && axisTag === 'opsz')
            // It was already yielded above and also should not
            // be present in here.
            continue;
        // Other than fontSize axesLocations are just not present when
        // at their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

function* colorsGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    for(const fieldName of getColorModelFields(keyMoment.constructor)) {
        const color = keyMoment.get(fieldName);
        yield* colorPropertyGen(fieldName, color);
    }
}

/**
 * These will be handled largly automated in regard to their type and,
 * if it emerges, on the setup stored here.
 * They are yielded into animanion scope with the `generic/${fieldName}`
 * prefix by genericPropertiesBroomWagonGen and they will have ui-elements
 * established in KeyMomentController accordingly.
 *
 * FIXME: maybe move into registered-properties/REGISTERED_PROPERTIES
 * also note that "KEYMOMENT_FIELDS" is largley the same as PROPERTIES
 * in this case, as all of the REGISTERED_PROPERTIES are located within
 * the KeyMoments and not directly within the Actors.
 */
const REGISTERED_GENERIC_KEYMOMENT_FIELDS = Object.freeze(new FreezableSet([
    'textRun', 'textAlign', 'positioningHorizontal', 'positioningVertical'
  , 'direction', 'heightTreatment', 'charGroup', 'showCellBoxes', 'cellAlignment'
]));

/**
 * This is to be able to simply yield properties of a keyMoment, that have
 * not been handled by the other, specialized, generators before. There's
 * so far no intrinsic way of knowing if a property has been handled before,
 * and as the property names within the keyMoment are translated to the
 * animation namespace from the other generators output before ( using
 * outerAnimanionAPI) it would be still hard to tell. Thus, this will be
 * rather very explicit, until it becomes more apparent how to select
 * properties to yield.
 *
 * A broom wagon is a vehicle that follows a cycling road race "sweeping"
 * up stragglers who are unable to make it to the finish within the time
 * permitted. If a cyclist chooses to continue behind the broom wagon,
 * they cease to be part of the convoy, and must then follow the usual
 * traffic rules and laws. (Wikipedia)
 */
function* genericPropertiesBroomWagonGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    for(const fieldName of keyMoment.keys()) {
        if(!REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName))
            continue;
        const item = keyMoment.get(fieldName)
          , path = Object.freeze([fieldName])
          ;
        yield* childrenPropertiesBroomWagonGen(GENERIC, path, item);
    }
}

/**
 * FIXME: there should be a standard way to tell if a mixin, e.g.
 * typographyKeyMomentPureModelMixin is part of a struct, moving
 * these mixins closer to the concept of a trait.
 * e.g. like struct.implements(typographyKeyMomentModelMixin)
 * so, a marker should be put into struct that makes it quick and easy
 * to check.
 */
function _keyMomentsImplementsTypography(keyMoments) {
    const Model = keyMoments.constructor.Model; // Maybe: if keyMoments.constructor.prototype instanceof _AbstractListModel
    return (
           Model.fields.has('fontSize')
        && Model.fields.get('fontSize') === FontSizeModel
        && Model.fields.has('axesLocations')
        && Model.fields.get('axesLocations') === AxesLocationsModel
    );
}

export function initAnimanion(keyMoments, isLoop) {
    const propertyGenerators = [numericPropertiesGen, colorsGen];
    if(_keyMomentsImplementsTypography(keyMoments))
        // add typography
        propertyGenerators.push(fontSizeGen, axisLocationsGen);
    propertyGenerators.push(genericPropertiesBroomWagonGen);
    return new LocalScopeAnimanion(propertyGenerators, keyMoments, isLoop);
}

/**
 * Orchestrate the own layer properties and the containg actor widgets.
 */
class StageHTML extends _BaseContainerComponent {
    constructor(widgetBus, _zones, baseCLass='Stage_HTML') {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden

        const containerElement = widgetBus.domTool.createElement('div')
          , topLayerElement = widgetBus.domTool.createElement('div')
          , layerBaseClass = `${baseCLass}-layer`
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', topLayerElement], ['parent-layer', widgetBus.wrapper.host]])
          ;
        // calling super early without widgets is only required when
        // the widgets definition requires the `this` keyword.
        topLayerElement.classList.add(layerBaseClass);
        topLayerElement.classList.add(`${layerBaseClass}-top`);
        containerElement.append(topLayerElement);
        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    'width', 'height'
                  , ['t', 'globalT']
                  , 'animationProperties@'
                ]
              , StageDOMNode
              , containerElement, topLayerElement
              , [baseCLass, `${baseCLass}-wrapper`]
            ]
            // These will probably have to be be selection dependent!
        //  , [
        //        {zone: 'parent-layer'}
        //      , [
        //            ['t', 't']
        //          , ['duration', 'duration'] // in seconds
        //          , ['isLoop', 'isLoop'] // never stop playback
        //          , ['perpetual', 'perpetual']
        //          , ['playing', 'playing']
        //          , ['keyMoments', 'keyMoments']
        //          , 'animationProperties@'
        //        ]
        //      , AnimationInfo
        //    ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActiveActorsRenderingController
              , zones
              , layerBaseClass
              , getActorWidgetSetup
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}

export class _BaseSelectAndDrag extends _BaseComponent {
        // jshint ignore:start
    static TEMPLATE = `<div class="select_and_drag">
    <label><strong class="select_and_drag-effect_label"></strong>
    <select><select><span class="select_and_drag-drag_handle drag_handle">✥</span>
    <span class="select_and_drag-description_label"></span>
    </label>
</div>`;
    // jshint ignore:end
    constructor(widgetBus, effectLabel, descriptionLabel) {
        super(widgetBus);
        [this.element, this._selectElement] = this.initTemplate(effectLabel, descriptionLabel);
    }
    initTemplate(effectLabel, descriptionLabel) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , selectElement = frag.querySelector('select')
          , effectLabelContainer = frag.querySelector('.select_and_drag-effect_label')
          , descriptionLabelContainer = frag.querySelector('.select_and_drag-description_label')
          , dragHandleElement = frag.querySelector('.select_and_drag-drag_handle')
          ;
        effectLabelContainer.textContent = effectLabel;
        descriptionLabelContainer.textContent = descriptionLabel;
        this._insertElement(element);

        dragHandleElement.setAttribute('draggable', 'true');
        dragHandleElement.addEventListener('dragstart', this._dragstartHandler.bind(this));
        dragHandleElement.addEventListener('dragend', this._dragendHandler.bind(this));

        return [element, selectElement];
    }

    // E.g. like this:
    // function setDragDataFN(dataTransfer, selectedValue) {
    //     dataTransfer.setData('application/x.typeroof-actor-create', `${selectedValue}`);
    //     dataTransfer.setData('text/plain', `[TypeRoof application/x.typeroof-actor-create: ${selectedValue}]`);
    // }
    _setDragDataFN(dataTransfer, selectedValue) {
        throw new Error(`NOT IMPLEMENTED ${this}._setDragDataFN (with ${selectedValue})`);
    }

    _dragstartHandler(event) {
        const selectedValue = this._selectElement.value;
        this._setDragDataFN(event.dataTransfer, selectedValue);
        event.currentTarget.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!

        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setDragImage(this._selectElement , 0 , 0);
    }

    _dragendHandler(event) {
        event.currentTarget.classList.remove('dragging');
    }
}

export class SelectAndDrag extends _BaseSelectAndDrag {
    constructor(widgetBus, effectLabel, descriptionLabel, setDragDataFN) {
        super(widgetBus, effectLabel, descriptionLabel);
        this._setDragDataFN = setDragDataFN;
    }
    update(changedMap) {
        if(changedMap.has('sourceTypes')) {
            const selected = this._selectElement.value
              , options = changedMap.get('sourceTypes')
              , optionElements  = []
              ;
            this._domTool.clear(this._selectElement);
            for(const [key, entry] of options) {
                optionElements.push(
                    this._domTool.createElement('option', {value: key}, entry.get('label').value));
            }
            this._selectElement.append(...optionElements);
            if(options.has(selected))
                this._selectElement.value = selected;
        }
    }
}

export class SelectAndDragByOptions extends _BaseSelectAndDrag {
    constructor(widgetBus, effectLabel, descriptionLabel, options) {
        super(widgetBus, effectLabel, descriptionLabel);
        this._options = Object.freeze(options.slice());
        this._createOptions(options);
    }

    _createOptions(options) {
        this._domTool.clear(this._selectElement);
        const optionElements = []
        for(const [key, [/*type*/, label/*, value*/]] of options.entries()) {
            const optionElement = this._domTool.createElement('option', {value: key}, label);
            optionElements.push(optionElement);
        }
        this._selectElement.append(...optionElements);
    }

    _setDragDataFN(dataTransfer, selectedValue) {
        if(!this._options[selectedValue])
            throw new Error(`KEY ERROR ${selectedValue} is not an option of: ${[...this._options.keys()].join(', ')}`);
        const [type, /*label*/, value] = this._options[selectedValue];
        dataTransfer.setData(type, `${value}`);
        dataTransfer.setData('text/plain', `[TypeRoof ${type}: ${value}]`);
    }
}

class StageManager extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="stage-manager_actors">(initial)</div>`;
    // jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        this._itemElements = new Map(/* Path: element*/);
        this._activePaths = new Set();
        this._removeDragIndicatorTimeoutId = null;
        [this.element, this._actorsElement] = this.initTemplate();
    }

    _onClickHandler(path) {
        this._changeState(()=>{
            // this is a toggle
            const editingActor = this.getEntry('editingActor');
            if(!editingActor.isEmpty && editingActor.value.equals(path))
                editingActor.clear();
            else
                editingActor.value = path;
        });
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , actors = frag.querySelector('.stage-manager_actors')
          ;
        this._insertElement(element);
        actors.addEventListener('dragleave', this._dragleaveHandler.bind(this));
        return [element, actors];
    }

    _dragstartHandler({path}, event) {
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_PATH, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${DATA_TRANSFER_TYPES.ACTOR_PATH}: ${path}]`);

        event.currentTarget.classList.add('dragging');
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

    _dragendHandler(item /*{path}*/, event) {
        event.currentTarget.classList.remove('dragging');
    }

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

    _dragoverHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _getDropTargetInsertPosition(item, event) {
        if(item.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = item.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null){
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of this._actorsElement.querySelectorAll(`.${markedClass}`)) {
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

        const [elem, posClassSuffix] = insertPosition === 'before' && element.previousSibling
                ? [element.previousSibling, 'after']
                : [element, insertPosition]
                ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
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
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);

        const {path} = item
          , rootPath = Path.fromString(this.widgetBus.getExternalName('activeActors'))
          , targetPath = rootPath.append(...path)
          , insertPosition = this._getDropTargetInsertPosition(item, event)
          ;

        if(type === DATA_TRANSFER_TYPES.ACTOR_PATH) {
            const relativeSourcePath = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH)
              , sourcePath = rootPath.appendString(relativeSourcePath)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.ACTOR_CREATE) {
            const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_CREATE);
            return this._create(typeKey, targetPath, insertPosition);
        }
    }

    _create(typeKey, targetPath, insertPosition) {
        // console.log(`${this}._create typeKey: ${typeKey} targetPath ${targetPath} insertPosition: ${insertPosition}`);
        return this._changeState(()=>{
            const activeActors = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // is an 'ActorsModel' ('activeActors')
                // Ensure we take the dependencies for the create from the
                // correct element, even though, at the moment, the dependencies
                // are all identical, it may change at some point.
              , newActor = createActor(typeKey, activeActors.dependencies)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // targetParent === sourceParent and the targetKey could
                // change is circumvented.
                activeActors.push(newActor);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              ;
            if(insertPosition === 'after')
                activeActors.splice(targetIndex + 1, 0, newActor);
            else if(insertPosition === 'before')
                activeActors.splice(targetIndex, 0, newActor);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _move(sourcePath, targetPath, insertPosition) {
        // console.log(`${this}._move sourcePath: ${sourcePath} targetPath ${targetPath}`);
        const canMove = !sourcePath.isRootOf(targetPath);
        if(!canMove) {
            console.warn(`${this}._move can't move source into target as source path "${sourcePath}" is root of target path "${targetPath}".`);
            return;
        }

        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const activeActors = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // is an 'ActorsModel' ('activeActors')
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                activeActors.push(source);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;

            if(activeActors === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                activeActors.splice(insertIndex, 0, source);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                activeActors.splice(targetIndex + 1, 0, source);
            else if(insertPosition === 'before')
                activeActors.splice(targetIndex, 0, source);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _renderLayer(path, activeActors, state=null) {
        const container = this._domTool.createElement('ol');
        if(activeActors.size === 0) {
            // empty container
            const item = {path, isEmptyLayerContainer: true, isEmptyLayerItem: false};
            container.addEventListener('dragenter', this._dragenterHandler.bind(this, item));
            container.addEventListener('dragover', this._dragoverHandler.bind(this, item));
            container.addEventListener('drop', this._dropHandler.bind(this, item));
        } // else: see for ...
        for(const [key, actor] of activeActors) {
            const itemElement = this._domTool.createElement('li')
              , itemPath = path.append(key)
              , dragHandleElement = this._domTool.createElement('span', {'class': 'drag_handle'}, '✥')
              // used to check:  isLayerItem = getEntry(actor , Path.fromParts('actorTypeModel', 'typeClass')).value === LayerActorModel
              , isContainerItem = getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE
              , isEmptyLayerItem = isContainerItem
                    ? getEntry(actor, Path.fromParts('instance', 'activeActors')).size === 0
                    : false
              , item = {path: itemPath, isEmptyLayerContainer: false, isEmptyLayerItem}
              ;

            if(state) {
                itemElement.classList.add((state.counter % 2) ? 'even-row' : 'odd-row');
                itemElement.style.setProperty('--structural-depth', `${state.depth}`);
                state.counter += 1;
            }

            dragHandleElement.setAttribute('draggable', 'true');
            dragHandleElement.addEventListener('dragstart', this._dragstartHandler.bind(this, item));
            dragHandleElement.addEventListener('dragend', this._dragendHandler.bind(this, item));

            itemElement.addEventListener('dragenter', this._dragenterHandler.bind(this, item));
            itemElement.addEventListener('dragover', this._dragoverHandler.bind(this, item));
            itemElement.addEventListener('drop', this._dropHandler.bind(this, item));

            itemElement.append(dragHandleElement, ...this._renderActor(itemPath, actor, state));
            container.append(itemElement);
            this._itemElements.set(itemPath.toString(), itemElement);
        }
        return [container];
    }

    _renderActor(path, actor, state=null) {
        const actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , actorLabel = actor.get('instance').get('label').value
        //  , typeClass = actorTypeModel.get('typeClass').value
          , fragment = this._domTool.createFragmentFromHTML(`<button><span></span> <em></em></button>`)
          , result = [...fragment.childNodes]
          , button = fragment.querySelector('button')
          ;
        button.addEventListener('click', this._onClickHandler.bind(this, path));
        fragment.querySelector('span').textContent = actorLabel ? `${typeLabel}: ${actorLabel}` : typeLabel;
        button.setAttribute('title', `local path: ${path}`);
        if(getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE) {
            // used to be if(typeClass === LayerActorModel) {
            const activeActorsPath = Path.fromParts('instance', 'activeActors')
              , activeActors = getEntry(actor, activeActorsPath)
              , childrenPath = path.append(...activeActorsPath)
              ;
            if(state) state.depth += 1;
            result.push(...this._renderLayer(childrenPath, activeActors, state));
            if(state) state.depth -= 1;
        }
        return result;
    }

    _markActiveItems(...pathsToActivate) {
        for(const activePathStr of this._activePaths) {
            this._itemElements.get(activePathStr).classList.remove('active');
        }
        this._activePaths.clear();
        for(const activePath of pathsToActivate) {
            const activePathStr = activePath.toString();
            if(!this._itemElements.has(activePathStr)) {
                // FIXME: need to figure out.
                // deserializeing four-panels-wip-0004_slides_as_layers.txt
                // triggers this. It's not critical though.
                console.error(`${this}._markActiveItems not found path "${activePathStr}" `
                        +`in elements: ${Array.from(this._itemElements.keys()).join(', ')}`)
                continue;
            }
            this._activePaths.add(activePathStr);
            this._itemElements.get(activePathStr).classList.add('active');
        }
    }

    update(changedMap) {
        const editingActor = changedMap.has('editingActor')
            ? changedMap.get('editingActor')
            : this.getEntry('editingActor')
            ;
        if(changedMap.has('activeActors')) {
            const activeActors = changedMap.get('activeActors')
              , basePath = Path.fromParts('./')
              ;
            this._domTool.clear(this._actorsElement);
            this._actorsElement.append(...this._renderLayer(basePath, activeActors, {counter: 0, depth: 0}));
            if(!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        }
        else if(changedMap.has('editingActor')) {
            this._markActiveItems(...(editingActor.isEmpty ? [] : [editingActor.value]));
        }
    }
}

class CommonActorProperties extends UIshowProcessedProperties {
    update(changedMap) {
        if(changedMap.has('keyMoments')) {
            // update own properties
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , localPropertyNames = animationProperties.animanion.localPropertyNames
              ;
            this.ownProperties.clear();
            for(const localPropertyName of localPropertyNames)
                this.ownProperties.add(localPropertyName);
        }

        // TODO: AnimationInfo has a more holistic handling than this.
        // TODO globalT/animationProperties dependencies need to be straightened
        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              // , propertyValuesMap = animationProperties.propertyValuesMap
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , ownPropertiesChildren = []
              , inheritedPropertiesChildren = []
              ;
            for(const [property, value] of propertyValuesMap) {
                const target = this.ownProperties.has(property)
                                        ? ownPropertiesChildren
                                        : inheritedPropertiesChildren
                                        ;

                const [color, consumed] = getColorFromPropertyValuesMap(property, propertyValuesMap);
                if(color !== null) {
                    const [elem] = this._createBasicDisplayElement(property, color);
                    target.push(elem);
                }
                if(consumed)
                    continue;
                if(property.startsWith('color/')) // plural "colors/" is the actual key
                // else: treat it like a full color will be deprecated ...
                    console.warn(`DEPRECATED: rendering color ${property}:`, value);

                const [elem] = this._createBasicDisplayElement(property, value);
                target.push(elem);
            }
            // FIXME: updating would be better, as of now, during animation
            // css :hover doesn't work here, because the elements get changed
            // to quickly. We should rather consider updating the existing
            // children as good as possible and have them remain at their
            // position as good as possible. (Only Chromium, Firefox can handle this)
            this.ownPropertiesContainer.replaceChildren(...ownPropertiesChildren);
            this.inheritedPropertiesContainer.replaceChildren(...inheritedPropertiesChildren);
        }
    }
}

// Used to be "KeyMomentsTimeline" in example-key-moments, but the name
// was not fitting anyways and this also lost the buttons to select the
// active keyMoments.
class KeyMomentsControls extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<fieldset class="key_moments_controls">
        <legend>Key-Moments Controls</legend>
        <div>
            <button class="key_moments_controls-add_moment" title="Add Moment">+ add</button><!--
            --><button class="key_moments_controls-remove_moment" title="Remove Active Moment">- remove</button><!--
            --><button class="key_moments_controls-insert_moment" title="Insert Moment at t">insert</button>
        </div>
        <div>
            <button class="key_moments_controls-select_previous" title="Select Previous">⇤ select previous</button><!--
            --><button class="key_moments_controls-select_next" title="Select Next">select next ⇥</button>
        </div>
</fieldset>`;
    static KEY_MOMENT_BUTTON_TEMPLATE=`<li>
    <button class="key_moments_controls-button" title="Select"></button>
</li>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        [this.element, this.addButton, this.removeButton
            , this.previousButton, this.nextButton] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , addButton = element.querySelector('.key_moments_controls-add_moment')
          , insertButton = element.querySelector('.key_moments_controls-insert_moment')
          , removeButton = element.querySelector('.key_moments_controls-remove_moment')
          , previousButton = element.querySelector('.key_moments_controls-select_previous')
          , nextButton = element.querySelector('.key_moments_controls-select_next')
          ;

        insertButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{

            const keyMoments = this.getEntry('keyMoments')
              // , t = this.getEntry(this.widgetBus.rootPath.append('t')).value
              // , liveProperties = this.widgetBus.getWidgetById('AnimationLiveProperties')
              , liveProperties = this.getEntry('animationProperties@')
              , t = liveProperties.t
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newMoment = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
              , [insertIndex, newMomentDuration, afterMoment
                    , newAfterMomentDuration
                ] = this._getInsertParameters(keyMoments, liveProperties, t)
                // Starting with "before index" here, meaning: "afterIndex - 1".
              , label = createLabelForKeyMoment(keyMoments, Math.max(0, parseFloat(insertIndex, 10) - 1))
                // Setting the properties for t and not setting the properties,
                // leaving them undefined, must have -- in this insert-situation
                // -- the same effect on the animation. These are just two different
                // approaches and the better approach should be determined by
                // considering usability. But, considering that a moment is
                // inserted, let's for now assume that capturing the "active"
                // properties is a feature, otherwise they could be hand-captured
                // by using the "set explicitly" button of each axis.
                // NOTE: In the future, it will be interestig e.g. to split
                // easing definitions in half!
              , newMomentProperties = liveProperties.getPropertyValuesMapForLocalT(t)
              ;
            const models = {};
            for(const [path_, value] of newMomentProperties) {
                // TODO: this is very specific behavior for the actual
                // KeyMoment type, and as such, it should probably be
                // rather attached to the implementation. Detached like
                // this, it will likely be forgotten to be updated.
                // Also, is kind related to the REGISTERED_GENERIC_KEYMOMENT_FIELDS
                // as these are not yet considered in here at all.
                // maybe move all of that into registered-properties/REGISTERED_PROPERTIES
                if(path_.startsWith(NUMERIC)) {
                    if(!Object.hasOwn(models ,'numericProperties'))
                        models.numericProperties = getEntry(newMoment, 'numericProperties');
                    const propertyName = Path.fromString(path_).parts.at(-1);
                    models.numericProperties.setSimpleValue(propertyName, value);
                }
                else if(path_.startsWith(COLOR)) {
                    // This would be working code, inserting the current colors
                    // initialized into the newMoment, without changing
                    // the appearance of the animation. However, it's probably
                    // better to have a new KeyMoment as empty as possible.
                    // Instead, a color can be inserted by initializing the
                    // desired model.

                    // const propertyName = Path.fromString(path_).parts.at(1)
                    //   , [colorObject, ] = _getColorFromPropertyValuesMap(path_, newMomentProperties)
                    //   , color = colorObject !== null ? culoriToColor(colorObject, newMoment.dependencies) : null
                    //   ;
                    // if(color !== null)
                    //     newMoment.set(propertyName, color);
                    continue;
                }

                else if(!_keyMomentsImplementsTypography(keyMoments))
                    // FIXME: This is not a well extensible way of coding this.
                    continue;
                else if(path_.startsWith('axesLocations/')) {
                    // only if available in these keyMoments (e.g. in TypographicKeyMomnets)
                    // CAUTION: opsz/autoOPSZ requires special treatment!
                    if(!Object.hasOwn(models ,'axesLocations'))
                        models.axesLocations = getEntry(newMoment, 'axesLocations');
                    const axisTag = Path.fromString(path_).parts.at(-1);
                    models.axesLocations.setSimpleValue(axisTag, value);
                }
                else if(path_ === 'fontSize')
                    // Only fontSize so far.
                    newMoment.get(path_).value = value;
                else
                    // FIXME: We trigger this with e.g. generic/charGroup
                    // of the videoproof-array actor but that has a default
                    // behavior of keeping the isEmpty setting which is OK.
                    // Leaving this comment here to support my call for
                    // a better handling of all of this from above.
                    console.warn(`NOT IMPLEMENTED property "${path_}" in ${this} insertButton.`);
            }
            if(newMomentDuration !== null)
                newMoment.get('duration').value = newMomentDuration;
            newMoment.get('label').value = label;
            if(afterMoment !== null && newAfterMomentDuration !== null)
                afterMoment.get('duration').value = newAfterMomentDuration;
            keyMoments.splice(insertIndex, 0, newMoment);
        }));

        // The add button, its functionality, is not totally wrong, so
        // I keep it here for now and add alongside the "insert" button.
        // TODO: However, as it is right now, I prefer to add an empty/initial
        // keyMoment, rather than a copy of the current Moment.
        addButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = Array.from(keyMoments)
                    .filter(([/*key*/, keyMoment])=>keyMoment.get('isActive').value)
                // last selected moment
              , activeKey = activeKeyMoments.size
                    // uses the logically/absolute last by value
                    ? activeKeyMoments.at(-1)[0]
                    : null
              ;

            const index =  activeKey !== null
                    // Insert after active entry.
                    ? parseInt(activeKey, 10) + 1
                    // just insert at end
                    : keyMoments.size
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newEntry = keyMoments.constructor.Model.createPrimalDraft(keyMoments.dependencies)
                // This would create a copy of the active entry.
                // Not sure if unwrapPotentialWriteProxy is required, but it doesn't hurt.
                // Decided against the copy:
                // newEntry = unwrapPotentialWriteProxy(keyMoments.get(activeKey))
              ;

            // insert
            newEntry.get('isActive').value = true;
            newEntry.get('label').value = createLabelForKeyMoment(keyMoments, index);
            keyMoments.splice(index, 0, newEntry);
        }));

        removeButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeys = Array.from(keyMoments)
                    .filter(([/*key*/, keyMoment])=>keyMoment.get('isActive').value)
                    .map(([key/*, keyMoment*/])=>key)
                    // delete higher indexes first, so lower indexes stay valid
                    .reverse()
              ;
            for(const key of activeKeys)
                keyMoments.delete(key);
        }));

        const _changeActiveMoment = changeAmount=>{
            if(changeAmount === 0)
                return;
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = Array.from(keyMoments)
                    .filter(([/*key*/, keyMoment])=>keyMoment.get('isActive').value)
              , size = keyMoments.size
              ;
            if(size === 0)
                return;
            const maxIndex = size - 1;
            if(activeKeyMoments.size === 0) {
                // Nothing selected, pick first or last
                let newIndex = (changeAmount > 0)
                        // (maxIndex + 1) % size === 0
                        ? (maxIndex + changeAmount) % size
                        // (size - 1) % size = maxIndex
                        : (size + changeAmount) % size
                        ;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;

                keyMoments.get(`${newIndex}`).get('isActive').value = true;
                return;
            }
            // change all
            const newActiveKeys = new Set();
            // prepare
            for(const [key/*,activeKeyMoment*/] of activeKeyMoments) {
                let newIndex = (parseInt(key, 10) + changeAmount) % size;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;
                newActiveKeys.add(`${newIndex}`);
            }
            for(const [key, keyMoment] of keyMoments)
                keyMoment.get('isActive').value = newActiveKeys.has(key);
        };
        previousButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(-1);
        }));
        nextButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(+1);
        }));

        this._insertElement(element);
        return [element, addButton, removeButton
              , previousButton, nextButton];
    }

    _getInsertParameters(keyMoments, liveProperties, t) {
            const absoluteT = t * liveProperties.fullDuration
                // - for t, get the absoluteT
                // - get the keyMoment after
              , momentTs = [...liveProperties.tToKeyMoments.keys()]
              , [leftIndex, rightIndex] = binarySearch(momentTs, absoluteT)
              , leftT = momentTs[leftIndex]
              , rightT = momentTs[rightIndex]
              ;

            // return values
            let insertIndex
              , newMomentDuration = null
              , newAfterMomentDuration = null
              , afterMoment = null
              ;
            if(leftIndex === null && rightIndex === null) {
                // No moments at all.
                // Just insert a blank, new, KeymomentMoment
                insertIndex = 0;
                newMomentDuration = null; // As per coherence function (will be 1).
                newAfterMomentDuration = null;
                afterMoment = null;

            }
            else if(leftIndex === null) {
                // leftIndex === null: t is bigger than/right of the last entry.
                //          Because absoluteT > momentTs[rightIndex]
                //          Assert: Must be a loop, otherwise there is no
                //                  right of last entry...
                //          Assert rightIndex === 0
                //          This will create a new last KeyMoment,
                //          but it will change the duration of the first
                //          keyMoment.
                // insert at the end
                afterMoment = keyMoments.get(0);
                insertIndex = keyMoments.size;
                // change first KeyMoment, as its duration closes the loop
                newMomentDuration = absoluteT - rightT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            else if(rightIndex === null) {
                // We're left from the first index,
                // This is not supposed to happen, because we use all
                // existing KeyMoments, not a subset and there is no
                // time before the first KeyMoment.
                throw new Error(`Assertion Failed, rightIndex must not be null.`);
            }
            else if (leftIndex === rightIndex) {
                //           Interesting since we can have possibly different in and
                //           out values when there are multiple moments at this position.
                //           We are directly on an existing momentT.
                //           Do we insert before or after?
                // Here the add-button allows for more control, but we can
                // just insert insert empty, after with a duration of 0.
                // But, since this method is changing the duration of the
                // after moment usually, it's maybe more intuitiv to insert
                // before. The way, properties are applied to the new moment,
                // via liveProperties, favors inserting after, it's jsut
                // simpler for now.
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT).at(-1);
                afterMoment = null;// Not required, doesn't change: keyMoments.get(afterIndex);
                insertIndex = parseInt(afterIndex,10) + 1;
                newMomentDuration = 0;
                newAfterMomentDuration = null; // don't change
            }
            else { // leftIndex !== rightIndex
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT)[0];
                afterMoment = keyMoments.get(afterIndex);
                insertIndex = afterIndex;
                newMomentDuration = absoluteT - leftT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            return [insertIndex, newMomentDuration, afterMoment, newAfterMomentDuration];
    }

    // FIXME: looking at the implementation, I'm not sure why UPDATE_STRATEGY_COMPARE
    // is chosen in here, but, the main dependency is a list, and hence
    // UPDATE_STRATEGY_COMPARE could cause less effort to update the element,
    // it is just not implemented so far. I leave this here as an example
    // how to turn UPDATE_STRATEGY_COMPARE into UPDATE_STRATEGY_SIMPLE
    initialUpdate(rootState) {
        const compareResult = StateComparison.createInitial(rootState, this.widgetBus.wrapper.dependencyMapping);
        this.update(compareResult);
    }

    update(compareResult) {
        // console.log(`${this.constructor.name}.update(compareResult):`, compareResult);
        // compareResult.toLog();
        // console.log('dependencyMapping', this.widgetBus.wrapper.dependencyMapping);
        const changedMap = this._getChangedMapFromCompareResult(compareResult);
        // console.log('compareResult.getChangedMap(this.widgetBus.wrapper.dependencyMapping)', changedMap);
        // console.log('compareResult.getDetaislMap()', compareResult.getDetaislMap());

        // TODO: try out changing based on LIST_NEW_ORDER state
        if(changedMap.has('keyMoments')) {
            const keyMoments = changedMap.get('keyMoments');
            this.previousButton.disabled = keyMoments.size < 2;
            this.nextButton.disabled = keyMoments.size < 2;
        }
    }
}

export class ToggleKeyMomentButton extends _BaseComponent {
    // jshint ignore:start
    static baseClass = 'ui_toggle_key_moment_button';
    // jshint ignore:end

    constructor(widgetBus) {
        super(widgetBus);
        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass}`
              , title: 'Select this Key-Moment for editing.'
            }, '(initializing)');
        this._insertElement(this.element);
        this.element.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const entry = this.getEntry('boolean');
            entry.set(!entry.value);
        }));
    }

    update(changedMap) {
        if(changedMap.has('label'))
            this.element.textContent = changedMap.get('label').value;

        if(changedMap.has('boolean')) {
            const booleanValue = changedMap.get('boolean').value
              , _setActiveClass = elem=>elem.classList[booleanValue ? 'add' : 'remove']('active')
              ;
            _setActiveClass(this.element);
            _setActiveClass(this.widgetBus.wrapper.host);
        }
    }
}

// FIXME: not all types require all REGISTERED_PROPERTIES[NUMERIC]
// e.g. Radius is nonsense for LineOfText, or basically for all except
// Circle. Children Time is only relevant for Layer and Stage, everything else
// doesn't have children. However, Font-Size should probably be in here,
// it doesn't seem to make much sense to treat it differently. However,
// Colors will be a different ballpark!
// Despite of different targets (fill, background, stroke, ... more?)
// we have the different models to specify (rgb+a, hsl+a) and similarly
// different ways to interpolate the compontents! having flat components
// in the key moments would make it cool to work within one model, but it
// would create a lot of entries and it's not yet fully clear to me how
// these would interpolate...
// Initially, this will be rough and we might have an property explosion,
// but we should work towards nice, color picker based interfaces.
// but what if I only want to modulate L (lightness) ...? The numeric
// properties model allows this, but when one keyMoment specifies RGB
// it's hard to only change L in top of that!.
// Ok, so the plan is to start with OKLCH then add OKLAB, interpolation
// considerations onlz start in step 2, when OKLCH and OKLAB are there,
// as interpolating between A and B will create another transition than
// between C and H
// Maybe we can start in step 2 using CSS color-mix(), then use the
// colorio library to rebuild the functionality for other targets, that
// e.g. only support rgba, like for an export without CSS support...



export class UINumericProperties extends _BaseComponent {
    constructor (widgetBus, ppsMap, getDefaults=null, requireUpdateDefaults=()=>false) {
        super(widgetBus);
        this._ppsMap = ppsMap;
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._propertiesChangeHandler = this._changeStateHandler(this.__propertiesChangeHandler.bind(this));

        this.element = this._domTool.createElement('div',
                {class: 'numeric_properties'},
                this._domTool.createElement('h3', {}, 'Numeric Properties'));

        this._insertElement(this.element);
        this._propertiesInterfaces = new Map();
        this._insertedElements = [];

        this._localPropertyValues = {};
        this._numericProperties = null;

        this._initUI();
    }

    // could be static and stand alone
    _setOrReset(mapLike, key, value) {
        if(value === null)
            mapLike.delete(key);
        else
            mapLike.setSimpleValue(key, value);
    }
     /* Run within transaction context */
    __propertiesChangeHandler(key, value) {
        const numericProperties = this.getEntry('numericProperties');
        this._setOrReset(numericProperties, key, value);
    }

    _cleanUp() {
        this._localPropertyValues = {};
        for(const ui of this._propertiesInterfaces.values())
            ui.destroy();
        this._propertiesInterfaces.clear();

        for(const element of this._insertedElements)
            this._domTool.removeNode(element);
        this._insertedElements.splice(0, Infinity);
    }

    _initUI() {
        const insertElement = (...elements)=>{
            this.element.append(...elements);
            this._insertedElements.push(...elements);
        };

        for(const key of this.propertiesKeys()) {
            if(this._propertiesInterfaces.has(key))
                //seen
                continue;
            const properties = {};
            for(const [k,v] of Object.entries(this.propertiesGet(key))) {
                if(k === 'default') {
                    properties.value = v;
                    continue;
                }
                properties[k] = v;
            }
            if(!('name' in properties))
                properties.name = key;
            if(!('value' in properties))
                properties.value = 0;

            const {name, value:defaultVal} = properties
              , ppsRecord = this._ppsMap.get(key)
              ;
            this._localPropertyValues[key] = defaultVal;

            const input = new PlainNumberAndRangeOrEmptyInput(
                this._domTool
                // numberChangeHandler
              , value=>this._propertiesChangeHandler(key, value)
                // toggleChangeHandler
              , ()=>{
                    const value = this._numericProperties.has(key)
                        ? null // if the property is defined delete
                        // if the property is not defined set default ...
                        : (this._getDefaults
                                    ? this._getDefaults(ppsRecord, key, defaultVal)
                                    : defaultVal
                          )
                        ;
                    this._propertiesChangeHandler(key, value);
                }
              , name === key ? `${name}` :`${name} (${key})`
              , undefined
              , properties
            );

            insertElement(input.element);
            // console.log('_propertiesInterfaces set:', key, input);
            this._propertiesInterfaces.set(key, input);
        }
    }

    propertiesHas(key) {
        return this._ppsMap.has(key);
    }
    propertiesGet(key) {
        const ppsRecord = this._ppsMap.get(key);
        return getRegisteredPropertySetup(ppsRecord)
    }

    propertiesKeys() {
        return this._ppsMap.keys();
    }

    *propertiesEntries() {
        for(const key of this.propertiesKeys())
            yield [key, this.propertiesGet(key)];
    }

    _getValueForProperty(key) {
        return this._numericProperties.has(key)
                    ? [true, this._numericProperties.get(key).value]
                    : [false, (this._getDefaults !== null
                            ? this._getDefaults(
                                      this._ppsMap.get(key)
                                    , key
                                    , this.propertiesGet(key)['default'])
                            : this.propertiesGet(key)['default']
                            )
                      ]
                    ;
    }

    _updateValueToPropertyInterface(key, active, value) {
        if(!this._propertiesInterfaces.has(key))
            throw new Error(`KEY ERROR property interface for "${key}" not found.`);
        const widget = this._propertiesInterfaces.get(key);
        widget.update(active, value);
        this._localPropertyValues[key] = value;
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);

        if(changedMap.has('numericProperties') || requireUpdateDefaults) {
            const numericProperties = changedMap.has('numericProperties')
                                        ? changedMap.get('numericProperties')
                                        : this.getEntry('numericProperties')
                                        ;
            this._numericProperties = numericProperties;
            for(const key of this.propertiesKeys()) {
                const [active, value] = this._getValueForProperty(key);
                // It's interesting: in a way, the sub-ui's could listen
                // directly to their entry at axesLocations/{axisTag}
                // but on the other hand, because we want to set defaults
                // in here when nothing is in axesLocations and that requires
                // updating as well, we do it directly here.
                // Maybe there will be/is a nicer way to implement behavior
                // like this. I.e. when the entry is DELETED the UI knows
                // it's default and sets it by itself.
                this._updateValueToPropertyInterface(key, active, value);
            }
        }
    }
}

// copied from example-key-moments
class KeyMomentController extends _BaseTypeDrivenContainerComponent {
    constructor(widgetBus, _zones, typeKey) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('li', {'class': 'ui_key_moment_controller'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        // MUST BE RESET after _update
        this._activationTestCache = null;
        const activationTest = ()=>{
            if(this._activationTestCache === null) {
                const keyMoment = this.widgetBus.getEntry(widgetBus.rootPath);
                // see trace to figure when to reset the cache!
                this._activationTestCache = keyMoment.get('isActive').value;
            }
            return this._activationTestCache;
        };
        // FIXME:
        // Dependencies that when they change require to update default
        // values of some fields ()
        // this._getDefaults changes return value when these dependencies
        // change.
        // It's the dependencies of AnimationLiveProperties:
        // ['t', 'keyMoments', 'isLoop']
        //  * Sans the 't' because that is the live animation
        //    position and the widgets here depend on the  keyMoment t,
        //  *  added "activeKey" as that change would change the default
        //     values as well (other keyMoment). But that would likely
        //     trigger full re-evaluation anyways.

        // FIXME: another example where I would prefer a relative path,
        // but in this case as well, it may not be relevant currently as
        // the KeyMomentController does not move in this example so far!
        // It is, however, totally possible, that the model will be
        // modified to reordfer keyMoments.
        this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        const updateDefaultsDependencies = [
                [this._animationPropertiesKey, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          , TypeClass =  this.widgetBus.getEntry(this.widgetBus.rootPath).constructor
          ;

        const widgets = this._defineWidgets(TypeClass, typeKey, localZoneElement
                , activationTest, requireUpdateDefaults
                , updateDefaultsDependencies
                );
        this._initWidgets(widgets);
    }

    _defineWidgets(TypeClass, typeKey, localZoneElement
                , activationTest, requireUpdateDefaults
                , updateDefaultsDependencies
                ) {
        // TODO: this displayes only a button with the label of the keymoment
        //       when the key moment is active, the label will be bold and
        //       below the button all the controls shall be displayed.
        const typographySpecificWidgets = [];
        if(typeKey === '[STAGE:null]' || isTypographicActorTypeKey(typeKey)) {
            typographySpecificWidgets.push(
            [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'value']
                    , ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , this._getDefaults.bind(this, ProcessedPropertiesSystemMap.createSimpleRecord(GENERIC, 'fontSize'), 'fontSize', 66)
              , requireUpdateDefaults
              , 'Font-Size' // label
              , 'pt'// unit
              , {min:0 , step:0.01, 'default': 36} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'fontSize']
                  , [typeKey === '[STAGE:null]' ? '/font' : '../../font', 'font']
                  , ['axesLocations', 'axesLocations']
                  , ['autoOPSZ', 'autoOPSZ']
                  , ...updateDefaultsDependencies
                ]
              , UIManualAxesLocations
              , this._getDefaults.bind(this)
              , ProcessedPropertiesSystemMap.createSimpleRecord('axesLocations/', 'axesLocations')
              , requireUpdateDefaults
            ]
            );
        }
        return [
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {zone: 'local'}
              , [
                    'label'
                  , ['isActive', 'boolean']
                ]
              , ToggleKeyMomentButton
            ]
          , [
                {zone: 'local', activationTest}
              , [
                    ['label', 'data']
                ]
              , DynamicTag
              , 'h3'
              , {}
              , (data)=>`Key Moment: ${data}`
            ]
            // label
          , [
                {zone: 'local', activationTest}
              , [
                    ['label', 'value']
                ]
              , UILineOfTextInput
              , 'Label'
            ]
            // duration
          , [
                {zone: 'local', activationTest}
              , [
                    ['duration', 'value']
                ]
              , UINumberInput
              , 'Relative Duration' // label
              , '/ Full Relative Duration'// unit
              , {min:0} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'local', activationTest}
              , [
                   // ['fontSize', 'value']
                    ...updateDefaultsDependencies
                  , 'numericProperties'
                ]
              , UINumericProperties
              , ProcessedPropertiesSystemMap.fromPrefix(NUMERIC, REGISTERED_PROPERTIES[NUMERIC].keys())
              , this._getDefaults.bind(this)
              , requireUpdateDefaults
            ]
          , ...typographySpecificWidgets
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.get(fieldName) === ColorModel // is ColorModel
                  , {zone: 'local', activationTest}
                  , COLOR
                  , {
                        updateDefaultsDependencies
                      , requireUpdateDefaults
                      , genericTypeToUIElement
                      , getDefaults: this._getDefaults.bind(this)
                    }
            )
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName)
                  , {zone: 'local', activationTest}
                  , GENERIC
                  , {
                        updateDefaultsDependencies
                      , requireUpdateDefaults
                      , genericTypeToUIElement
                      , getDefaults: this._getDefaults.bind(this)
                    }
            )
        ];
    }
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }

    _getDefaults(ppsRecord, modelFieldName, defaultVal=_NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const {fullKey} = ppsRecord
           , liveProperties = this.getEntry(this._animationPropertiesKey)
            // , activeKey = this.widgetBus.rootPath.parts.at(-1)
            //   animationProperties.
            // , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
            // We can also get the globalT and get the value from this...
            //
            // I'm not sure now what the reasoning was to not use globalT
            // in here, but it makes the sliders of unset values animate
            // when they are changed in a parent scope, very cool effect
            // actually.
           , globalT = this.getEntry('/activeState/t').value
           , propertyValues = liveProperties.animanion.getPropertiesFromGlobalT(globalT)
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
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for global-t ${globalT} in ${liveProperties}`);
    }
}

class KeyMomentsController extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, ...customArgs) {
        super(widgetBus, zones);
        this._customArgs = customArgs;
    }
    _createWrapper(rootPath) {
        const settings = {
               rootPath: rootPath
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = KeyMomentController
          , args = [this._zones, ...this._customArgs]
          , childWidgetBus = this._childrenWidgetBus
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class UISelectTaskAutomation extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_select_task_automation">
        <!-- insert: select-widget -->
        <button class="ui_select_task_automation-execute">run</button>
</div>`;
    //jshint ignore:end
     constructor (widgetBus, items) {
        super(widgetBus);

        this._items = items;
        const itemKeyTolabels = new Map(Array.from(this._items.entries())
                    .map(([key, [label/*, TaskAutomationDialog */]])=>[key, label]));
        [this.element, this._select] = this.initTemplate(itemKeyTolabels);
        this._dialog = null;
    }

    initTemplate(items) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , select = new PlainSelectInput(this._domTool, null, 'Macros', items)
          , button = element.querySelector('.ui_select_task_automation-execute')
          ;
        select.element.title = 'run task automations';
        button.addEventListener('click', ()=>this._executeItem(this._select._input.value));
        this._domTool.insertAtMarkerComment(element, 'insert: select-widget', select.element);
        this._insertElement(element);
        return [element, select];
    }

    async _executeItem(key) {
        if(this._dialog !== null)
            console.error(`${this}._executeItem can't execute this._dialog is not empty`);
        let result = null;
        const [/*label*/, TaskAutomationDialog] = this._items.get(key);
        this._dialog = new TaskAutomationDialog(this._domTool);

        try {
          // FIXME: it would be good to have this guarded in a kind of
          // transaction, so that only this thread can manipulate
          // the global state until it is finished. So far, that is
          // only "informal", as the dialog is modal. Ideally, we could
          // "lock" the sub-element that we are working on. In case of
          // an error, we could just put the original sub element back
          // in place.
          result = await this._dialog.show(this.widgetBus);
        }
        catch(error) {
            console.error(`TASK_AUTOMATION_DIALOG ERROR ${this}._executeItem with "${key}":`, error);
        }
        finally {
            if(this._dialog) {
                this._dialog.destroy();
                this._dialog = null;
            }
        }
        return result;
    }

    destroy() {
        if(this._dialog) {
            this._dialog.destroy();
            this._dialog = null;
        }
        return super.destroy();
    }

    // update(/* changeMap*/) {
        // pass
    // }
}

class PropertiesManager extends _CommonContainerComponent {
    // jshint ignore:start
    /**
     * could be as well:
     * initialUpdate(...args){
     *     return _BaseDynamicCollectionContainerComponent.prototype.initialUpdate.call(this, ...args);
     * }
     */
    initialUpdate = _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    // jshint ignore:end
    constructor(widgetBus, zones) {
        // provision widgets dynamically!
        super(widgetBus, zones);
        this._currentActorTypeKey = null;
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName('actorPath'));
        // Seem not required: the child will define this dependency:
        //
        // const actorsPathStr = this.widgetBus.getExternalName('actors')
        //   , actorsPath = Path.fromString(actorsPathStr)
        //   , actorPath = this.getEntry('actorPath')
        //   ;
        // if(!actorPath.isEmpty) {
        //     // get info when active actor changes, on type change, we want
        //     // to change the widgets
        //
        //     const absoluteActorsPath = actorsPath.append(...actorPath.value);
        //     dependencies.add(absoluteActorsPath.toString());
        // }
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName('actorPath'));
        return dependencies;
    }

    _createStageWrappers() {
        const widgetAbsRootPath = Path.fromParts(this.widgetBus.getExternalName('stage'))
          , widgetRootPath = widgetAbsRootPath.toRelative(this.widgetBus.rootPath)
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          ;
        const widgets = [
            [
                {
                    zone: 'main'
                }
              , []
              , StaticTag
              , 'h3'
              , {}
              , 'Stage:'
            ]
          , getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                ]
              , UISelectTaskAutomation
              , CONTAINER_TASK_AUTOMATIONS
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['keyMoments', 'keyMoments']
                  , 'animationProperties@'
                ]
              , KeyMomentsControls
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , keyMomentsMain
            ]
          , [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['keyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into keyMomentsMain
              , new Map([...this._zones, ['main', keyMomentsMain]]) // zones
              , '[STAGE:null]'// has no typeKey, but is also no Type....
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                  , 'animationProperties@'
                  , ['/activeState/t', 'globalT']
                ]
              , CommonActorProperties // Constructor
              , '[STAGE:null]'// has no typeKey, but is also no Type....
              // , ...args
            ]
            // TODO: add widgets for specific aspects of the actorType
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenWidgetBus, ...widgetArgs));
    }

    _getActorSpecificWidgetSetup(widgetRootPath, widgetKey) {
        const settings = {
            FontSelect: [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
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
          , ContainerTaskAutomations: [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                ]
              , UISelectTaskAutomation
              , CONTAINER_TASK_AUTOMATIONS
            ]
        };

        if(Object.hasOwn(settings, widgetKey))
            return settings[widgetKey];
        throw new Error(`KEY ERROR not found widgetKey "${widgetKey}" in ${this}._getActorSpecificWidgetSetup.`);
    }

    _createActorWrappers(actorPath, actor) {
        const typeKey = actor.get('actorTypeKey').value
          , label = actor.get('actorTypeModel').get('label').value
          , actorsAbsPath = Path.fromString(this.widgetBus.getExternalName('actors'))
          , actorsPath = actorsAbsPath.toRelative(this.widgetBus.rootPath)
          // , actorTypeModel = actor.get('actorTypeModel')
          // , typeLabel = actorTypeModel.get('label').value
          // , typeClass = actorTypeModel.get('typeClass').value
          // actor.get('instance')
          , widgetRootPath = actorsPath.append(...actorPath, 'instance')
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          , actorSpecificWidgets  = getActorTypeKeySpecificWidgets(typeKey)
                .map(widgetKey=>this._getActorSpecificWidgetSetup(widgetRootPath, widgetKey))
          ;

        const widgets = [
            [
                {
                    zone: 'main'
                }
              , []
              , StaticTag
              , 'h3'
              , {}
              , `${label}:`
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'}
              , [
                    'animationProperties@'
                  , 'keyMoments'
                ]
              , UIActorTimeControlKeyMomentSelectCircle
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'}
              , [
                    ['label', 'value']
                ]
              , UILineOfTextInput
              , 'Label'
            ]
          , getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
          , ...actorSpecificWidgets
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['keyMoments', 'keyMoments']
                  , 'animationProperties@'
                ]
              , KeyMomentsControls
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , keyMomentsMain
            ]
          , [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['keyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into keyMomentsMain
              , new Map([...this._zones, ['main', keyMomentsMain]]) // zones
              , typeKey
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                  , 'animationProperties@'
                  , ['/activeState/t', 'globalT']
                ]
              , CommonActorProperties // Constructor
              , typeKey
              // , ...args
            ]
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenWidgetBus, ...widgetArgs));
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult)
          , actorPathOrEmpty = changedMap.has('actorPath')
                ? changedMap.get('actorPath')
                : this.getEntry('actorPath')
           , actors = changedMap.has('actors')
                ? changedMap.get('actors')
                : this.getEntry('actors')
           , actor = !actorPathOrEmpty.isEmpty
                  // If path can't be resolved actor becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                ? getEntry(actors, actorPathOrEmpty.value, null)
                : null
           , actorTypeKey = actor === null ? null : actor.get('actorTypeKey').value
           , typeChanged = this._currentActorTypeKey !== actorTypeKey
           , rebuild = changedMap.has('actorPath') || typeChanged
           ;
        this._currentActorTypeKey = actorTypeKey;

        if(rebuild) {
            // deprovision widgets
            for(const widgetWrapper of this._widgets)
                widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set();

        // Keeping for debugging for now:
        // console.log(`${this.constructor.name}._provisionWidgets(compareResult):`, ...changedMap.keys()
        //     , `\n actor !== null`, actor !== null
        //     , `\n changedMap.has('actorPath')`, changedMap.has('actorPath')
        //     , `\n typeChanged`, typeChanged, `actorTypeKey`, actorTypeKey
        //     , `\n rebuild`, rebuild
        // )

        const widgetWrappers = [];

        if(actor !== null && rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            widgetWrappers.push(...this._createActorWrappers(actorPathOrEmpty.value, actor));
        }
        else if(rebuild) {
            // The StageAndActorsModel actually functions as the root
            // of all properties, so we manage the stage when we don't
            // manage another actor...
            widgetWrappers.push(...this._createStageWrappers());
        }

        this._widgets.push(...widgetWrappers);
        for(const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}


class UIFramesPerSecond extends _BaseComponent{
 static TEMPLATE = `<div class="ui_frames_per_second">
        <output class="ui_frames_per_second-output">-</output>
        <span>FPS</span>
    </div>`;
     constructor (widgetBus) {
        super(widgetBus);
        this._last = this._domTool.window.performance.now();
        [this.element, this._output] = this.initTemplate();
    }

    initTemplate() {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , output = element.querySelector('.ui_frames_per_second-output')
          ;
        this._insertElement(element);
        return [element, output];
    }
    update(/*changedMap*/) {
        const now = this._domTool.window.performance.now()
          , delta = (now - this._last)
          , fps = 1000/delta
          ;
        this._last = now;
        this._output.textContent = `${fps.toFixed(2)}`;
    }
}
class UIClock extends _BaseComponent{
 static TEMPLATE = `<div class="ui_clock">
        <strong>Clock:</strong>
        <output class="ui_clock-output"></output>
    </div>`;
     constructor (widgetBus) {
        super(widgetBus);
        [this.element, this._output] = this.initTemplate();
    }

    initTemplate() {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , output = element.querySelector('.ui_clock-output')
          ;
        this._insertElement(element);

        return [element, output];
    }
    _format(size, value) {
        return ('0'.repeat(size) + value).slice(-size);
    }
    update(changedMap) {
        const format2 = this._format.bind(this, 2)
          ,  t = (changedMap.has('t')
                    ? changedMap.get('t')
                    : this.getEntry('t')
                ).value
          , duration = (changedMap.has('duration')
                    ? changedMap.get('duration')
                    : this.getEntry('duration')
                ).value
          , time = duration * t
          , totalHours = `${Math.trunc(duration / 60 / 60)}`
          , fullSeconds = Math.trunc(time)
          , fullMinutes = Math.trunc(fullSeconds / 60)
          , hours = Math.trunc(fullMinutes / 60)
          , minutes = (fullMinutes % 60)
          , seconds = (fullSeconds % 60)
          , miliseconds = Math.trunc((time % 1) * 100)
          , clock = [
                this._format(totalHours.length > 2 ?  totalHours.length : 2, hours)
              , format2(minutes)
              , format2(seconds) + `.${format2(miliseconds)}`
            ]
          ;
        this._output.textContent = clock.join(':');
    }
}
export class UITimeControl extends _BaseContainerComponent{
    constructor(widgetBus, _zones) {
         const localZoneElement = widgetBus.domTool.createElement('fieldset', {'class': 'ui_time_control'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);
        collapsibleMixin(localZoneElement, 'legend', true);

        const widgets = [
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Time'
            ]
          , ...Object.entries(getBasicPlayerControlWidgets({zone: 'local'}))
                                    .filter(([k,/*v*/])=>k!=='isLoop').map(([/*k*/,v])=>v)
          , [
                {zone: 'local'}
              , ['t', 'playing']
              , UITimeControlCircle
            ]
          , [
                {zone: 'local'}
              , ['t', 'duration']
              , UIClock
            ]
          , [
                {zone: 'local'}
              , ['t']
              , UIFramesPerSecond
            ]
        ]
        this._initWidgets(widgets);
    }
}

class StageAndActorsController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('animationProperties@'));
        const stageManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'stage-manager'})
          , propertiesManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'properties-manager'})
          , zones = new Map([..._zones, ['stage-manager', stageManagerContainer] , ['properties-manager', propertiesManagerContainer]])
          ;
        // widgetBus.insertElement(stageManagerContainer);
        super(widgetBus, zones);
        collapsibleMixin(stageManagerContainer, 'legend');
        collapsibleMixin(propertiesManagerContainer, 'legend');
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {zone: 'stage-manager'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Stage Manager'
            ]
          , [
                {zone: 'properties-manager'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Properties'
            ]
          , [
                {zone: 'main'}
              , []
              , UITimeControl
              , zones
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , stageManagerContainer
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , propertiesManagerContainer
            ]
          , [
                {}
              , [
                    ['t', 'globalT'], 'keyMoments', 'isLoop'
                    // NOT required as this is the root. However, it could
                    // be used here as well e.g. to inject global defaults'.
                    // parent is always two levels above from here
                    // as this is {index}/instance
                    //, [`animationProperties@${widgetBus.rootPath.append('..', '..')}`, '@parentProperties']
                ]
              , ContainerMeta
              , zones
              , initAnimanion
              , isInheritingPropertyFn
            ]
          , [
                {zone: 'layout'}
              , []
              , StageHTML
              , zones
              , 'stage_and_actors'
            ]
            // Part of StageManger: select type and drag into StageManger
            // to create it add the drop position.
          , [
                {
                    zone: 'stage-manager'
                }
              , [
                    ['availableActorTypes', 'sourceTypes']
                ]
              , SelectAndDrag
              , 'Create'
              , 'drag and drop into Stage Manager.'
              , function setDragDataFN(dataTransfer, selectedValue) {
                    dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_CREATE, `${selectedValue}`);
                    dataTransfer.setData('text/plain', `[TypeRoof ${DATA_TRANSFER_TYPES.ACTOR_CREATE}: ${selectedValue}]`);
                }
            ]
          , [
                {
                    zone: 'stage-manager'
                }
              , [
                    ['activeActors', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Remove actor'
              , 'drag and drop into bin from Stage Manager.'
              , [DATA_TRANSFER_TYPES.ACTOR_PATH]
            ]
          , [
                {
                    zone: 'stage-manager'
                }
              , [
                    'activeActors', 'editingActor'
                ]
              , StageManager
            ]
          , [
                {}
              , [
                    ['editingActor', 'actorPath']
                  , ['activeActors', 'actors']
                  , ['.', 'stage']
                ]
              , PropertiesManager
              , new Map([...zones, ['main', propertiesManagerContainer]])
            ]
        ];
        this._initWidgets(widgets);
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
    StageAndActorsModel as Model
  , StageAndActorsController as Controller
};
