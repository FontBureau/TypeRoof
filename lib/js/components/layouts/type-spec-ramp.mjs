/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    zip
} from '../../util.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , _CommonContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , HANDLE_CHANGED_AS_NEW
} from '../basics.mjs';

import {
    collapsibleMixin
  , StaticNode
  , StaticTag
  , UILineOfTextInput
} from '../generic.mjs';

import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
// , _AbstractSimpleOrEmptyModel
  , ForeignKey
  , ValueLink
  , StaticDependency
// , CoherenceFunction
  , StringModel
  , PathModelOrEmpty
  , createAvailableTypes
  , Path
  , getEntry
} from '../../metamodel.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    FontSizeModel
} from '../actors/models.mjs';

import {
    ColorModel
} from '../color.mjs';

import {
    manualAxesLocationsModelMixin
} from '../ui-manual-axis-locations.mjs';

import {
    DATA_TRANSFER_TYPES
  , SelectAndDragByOptions
  , WasteBasketDropTarget
} from './stage-and-actors.mjs';

import {
    UITypeDrivenContainer
  , ProcessedPropertiesSystemMap
} from '../type-driven-ui.mjs'

import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';

import {
    COLOR
  , GENERIC
} from '../registered-properties-definitions.mjs';

export class _BaseStylePatchModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}

// as defined im actors/models.mjs as typographyKeyMomentPureModelMixin
// which I don't want to include here, as this is no actor, but it may
// come from a shared base eventually, I keep the name for reference.
const typographyKeyMomentPureModelMixin = [
        ['fontSize', FontSizeModel]
      , ['textColor', ColorModel] // inherited from upper layers
      , ['backgroundColor', ColorModel] // not inherited
    ]
    // inline styles can set these but e.g. not the text-alignment
    // or line-height. local font em, but not paragraph/section font size
  , typographyInlineMixin = [
        // fontOrEmpty => comes from model.typographyActorMixin
        // should definitely be reused from there! But that has
        // a parentFont and this must not!
        // that's different for the paragraph, that always has a
        // parentFont. so we need diversification!.
        //
        // maybe that can move though.
        //
        // font-size should be in EM, but we don't do units yet
        ...typographyKeyMomentPureModelMixin
      // , optentypeFeatures
      , ...manualAxesLocationsModelMixin
    ]
  , typographyParagraphMixin = [
    /*
        alignment
      , leading // line-height auto, or value, auto may have configuration as well

      => indent
      => alignment->settings?
      => top-bottom margins
      => columns?
    */
    ]
  ;

// Styles, Colors and Actors start of here very similar, this was initially based
// on the Actor model system.
export const StylePatchTypeModel = _AbstractGenericModel.createClass('StylePatchTypeModel')// => .value will be a concrete _BaseStyleModel
    // make this selectable...
  , AvailableStylePatchTypeModel = _AbstractStructModel.createClass(
        'AvailableStylePatcheTypeModel'
      , ['label', StringModel]
      , ['typeClass', StylePatchTypeModel]
    )
  , AvailableStylePatchTypesModel = _AbstractOrderedMapModel.createClass('AvailableStylePatchTypesModel', AvailableStylePatchTypeModel)
  , SimpleStylePatchModel = _BaseStylePatchModel.createClass(
        'SimpleStylePatchModel'
        // There's no reason to put these under another key
        // TypeSpec and this should use the same mixin, as the shared
        // definitions are the ones that can be overridden by a patch.
      , ...typographyInlineMixin//  is the KeyMoment version useful here
    )
  , StylePatchKeyModel = StringModel // or KeyValueModel or somethign custom?
  , StylePatchKeysModel = _AbstractListModel.createClass('StylePatchKeysModel', StylePatchKeyModel)
  , CompositeStylePatchModel = _BaseStylePatchModel.createClass(
        'CompositeStylePatchModel'
        // keys that don't exist become null entries, so maybe these
        // don't have to be actual linked keys? It would be nice though
        // to produce the actual list of styles directly in here.
        //
        // Going to start with a list of strings unless there's a
        // reasonable way to get the final, composites resolved, list
        // of keys.
        // So far, we don't have a way to embed such a custom getter
        // into a

        // FIXME: could we define a list of keys into
           // the dependency "stylePatches" of the parent TypeSpecRampModel // a StylePatchesMapModel
           // and SET_NULL + ALLOW_NULL seems not possible to me now, but I can look it up
           // we could read the styles directly, but I don't see how dependencies are
           // resolved smartly on metamorphose.
      , ['styles', StylePatchKeysModel]
        // selfNull may be better to handle in editing situations
        // but it also allows for inconsistencies to exist, we could offer
        // a cleanup-button, maybe when conflicts are detected.
    //  , ['circularDependencyStrategy', Enum(allNull, selfNull)]
    )
  , [availableStylePatchTypes, STYLE_PATCH_TYPE_TO_STYLE_PATCH_TYPE_KEY] =
        createAvailableTypes(AvailableStylePatchTypesModel, [
            ['SimpleStylePatch', 'Simple', SimpleStylePatchModel]
          , ['CompositeStylePatch', 'Composite', CompositeStylePatchModel]
        ])
  , StylePatchModel = _AbstractStructModel.createClass(
        'StylePatchModel'
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableStylePatchTypes'
                      , AvailableStylePatchTypesModel
                      , availableStylePatchTypes
                      )
      , ['stylePatchTypeKey', new ForeignKey('availableStylePatchTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['stylePatchTypeModel', new ValueLink('stylePatchTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicStylePatchModel'
                            , _BaseStylePatchModel
                            ,'stylePatchTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableStylePatchTypes'])]
    )
  , StylePatchesMapModel = _AbstractOrderedMapModel.createClass('StylePatchesMapModel', StylePatchModel)
    // A recursive definition!
    // , TypeSpecMap = _AbstractOrderedMapModel.createClass('TypeSpecMap', TypeSpec)
  , TypeSpecModel = _AbstractStructModel.createClass(
        'TypeSpec'
      , ...typographyParagraphMixin // there's no reason to put these under another key
      , ...typographyInlineMixin
        // Is this just for easy access?? "named styles" maybe?
        // , ['styles', dict mapping the style name to the style key, though, we could also just allow all "patches" in any style] // subordnate styles
        // Just a thought, if we'd use a 'parents' list we could create
        // a mixin-like situation, with multiple inheritance.
        // => TypeSpecModelMap: Ordered dict of TypeSpecs (we want to use the keys as paths)
      , ['children', _AbstractStructModel.WITH_SELF_REFERENCE, TypeSpecModel=>_AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpecModel)]
      // To be able to reference the available patches, we should include
      // a dependency to the StylePatchesMapModel keys within that are
      , ['label', StringModel]
    )
    //  We can't create the self-reference directly
    //, TypeSpecModelMap: TypeSpec.get('children') === _AbstractOrderedMapModel.createClass('TTypeSpecModelMap', TypeSpec)
  , TypeSpecRampModel = _BaseLayoutModel.createClass(
        'TypeSpecRampModel'
        // The root TypeSpec
      , ['typeSpec', TypeSpecModel]
      , ['editingTypeSpec', PathModelOrEmpty]
        // could potentially be a struct with some coherence logic etc.
        // for the actual data
      , ['stylePatches', StylePatchesMapModel]
        // the root of all typeSpecs
    )
  ;


function _uniqueKey(keys) {
    const keysSet = new Set(keys)
      , numericKeys = new Set()
      ;
    let highest = null;
    for(const key of keysSet) {
        const num = parseFloat(key);
        if(!isFinite(num)) continue;
        if(numericKeys.has(num)) continue;
        numericKeys.add(num);
        if(highest === null || num > highest)
            highest = num;
    }
    let keyNum = highest === null ? 0 : Math.ceil(highest)
      , newKey = `${keyNum}`
      ;
    while(keysSet.has(newKey)) {
        // will in each iteration at least add 1
        do {
            keyNum += 1;
        } while(numericKeys.has(keyNum));
        newKey = `${keyNum}`;
    }
    return newKey;
}

/**
 * used to be StageManager in stages-and-actors, but this is intended to
 * become more generally useful/shareable
 * There are differences also in the data models:
 *    TypeSpec.children is an OrderedMap
 *    activeActors: ActorsModel is a List
 * The type of the children is totally different.
 */
class TreeEditor extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="tree_editor stage-manager_actors">(initial)</div>`;
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

    static DATA_TRANSFER_TYPES = {
        PATH: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH
      , CREATE: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE
    }

    get DATA_TRANSFER_TYPES() {
        return this.constructor.DATA_TRANSFER_TYPES;
    }

    _dragstartHandler({path}, event) {
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        const type = this.DATA_TRANSFER_TYPES.PATH
        event.dataTransfer.setData(type, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${type}: ${path}]`);

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
        const applicableTypes = [this.DATA_TRANSFER_TYPES.PATH, this.DATA_TRANSFER_TYPES.CREATE];
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
        // Don't use event.dataTransfer.getData(this.DATA_TRANSFER_TYPES.PATH);
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
        // const data = event.dataTransfer.getData(this.DATA_TRANSFER_TYPES.APATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === this.DATA_TRANSFER_TYPES.PATH
                ? 'move'
                : 'copy' // this.DATA_TRANSFER_TYPES.CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === this.DATA_TRANSFER_TYPES.PATH
                ? 'move'
                : 'copy' // this.DATA_TRANSFER_TYPES.CREATE
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

        if(type === this.DATA_TRANSFER_TYPES.PATH) {
            const relativeSourcePath = event.dataTransfer.getData(this.DATA_TRANSFER_TYPES.PATH)
              , sourcePath = rootPath.appendString(relativeSourcePath)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === this.DATA_TRANSFER_TYPES.CREATE) {
            const typeKey = event.dataTransfer.getData(this.DATA_TRANSFER_TYPES.CREATE);
            return this._create(typeKey, targetPath, insertPosition);
        }
    }

    _createItem(typeKey, dependencies) {
        // return newActor = createActor(typeKey, dependencies);
        if(typeKey !== 'TypeSpec')
            throw new Error(`VALUE ERROR don't know how to create item for typeKey: "${typeKey}"`);
        return TypeSpecModel.createPrimalDraft(dependencies);
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
              , newActor = this._createItem(typeKey, activeActors.dependencies)
              , uniqueKey = _uniqueKey(activeActors.keys())
              , newEntry = [uniqueKey, newActor]
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // targetParent === sourceParent and the targetKey could
                // change is circumvented.

                // NOTE: as an ordered dict, this requires a new unique key
                // a list doesn't require that at all!
                activeActors.push(newEntry);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = activeActors.indexOfKey(targetKey)
              ;
            if(insertPosition === 'after')
                activeActors.arraySplice(targetIndex + 1, 0, newEntry);
            else if(insertPosition === 'before')
                activeActors.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    // FIXME: especially in move reference may require updating
    //        however, with a Map as container the situation should
    //        be much more stable.
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
              , newEntry = [null ,source]
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                // We may preserve the old key if it is free.
                const uniqueKey = activeActors.has(sourceKey)
                        ? _uniqueKey(activeActors.keys())
                        : sourceKey
                  ;
                newEntry[0] = uniqueKey;
                activeActors.push(newEntry);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = activeActors.indexOfKey(targetKey)
              , sourceIndex = sourceParent.indexOfKey(sourceKey)
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

                // In this case, key must be stable!
                // This keeps all references to this path stable.
                // I.e. when moved within in the same parent
                newEntry[0] = sourceKey;
                sourceParent.delete(sourceKey);
                activeActors.arraySplice(insertIndex, 0, newEntry);
                return;
            }
            // We may preserve the old key if it is free.
            const uniqueKey = activeActors.has(sourceKey)
                ? _uniqueKey(activeActors.keys())
                : sourceKey
                ;
            newEntry[0] = uniqueKey;
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                activeActors.arraySplice(targetIndex + 1, 0, newEntry);
            else if(insertPosition === 'before')
                activeActors.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _isContainerItem(item) {
        //return getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE;
        return item instanceof TypeSpecModel;
    }

    // _containerRelPathToChildren = Path.fromParts('instance', 'activeActors');
    _containerRelPathToChildren = Path.fromParts('children');

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
              , isContainerItem = this._isContainerItem(actor)
              , isEmptyLayerItem = isContainerItem
                    ? getEntry(actor, this._containerRelPathToChildren).size === 0
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

    _getItemLabel(item) {
        // const actorTypeModel = actor.get('actorTypeModel')
        //   , typeLabel = actorTypeModel.get('label').value
        //   , actorLabel = actor.get('instance').get('label').value
        //   ;
        // //  , typeClass = actorTypeModel.get('typeClass').value
        // return actorLabel ? `${typeLabel}: ${actorLabel}` : typeLabel;
        const typeLabel = 'TypeSpec'
           , itemLabel  = item.get('label').value
           ;
        return itemLabel ? `${typeLabel}: ${itemLabel}` : typeLabel;
    }

    _renderActor(path, actor, state=null) {
        const fragment = this._domTool.createFragmentFromHTML(`<button><span></span> <em></em></button>`)
          , result = [...fragment.childNodes]
          , button = fragment.querySelector('button')
          ;
        button.addEventListener('click', this._onClickHandler.bind(this, path));
        fragment.querySelector('span').textContent = this._getItemLabel(actor)
        button.setAttribute('title', `local path: ${path}`);
        if(this._isContainerItem(actor)) {
            // used to be if(typeClass === LayerActorModel) {
            const activeActorsPath = this._containerRelPathToChildren
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

const _NOTDEF = Symbol('_NOTDEF');
class TypeSpecPropertiesManager extends _CommonContainerComponent {
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
        dependencies.add(this.widgetBus.getExternalName('typeSpecPath'));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName('typeSpecPath'));
        return dependencies;
    }

    _createTypeSpecWrappers(typeSpecPath, rootTypeSpecPath/*, typeSpec*/) {
        const TypeClass =  this.widgetBus.getEntry(typeSpecPath).constructor
          , exclude = new Set([
                      'children' // => Controlled globally by TreeEditor
                    , 'label' // => This has a control for label.
                    , 'autoOPSZ' // => UIManualAxesLocations has a control for autoOPSZ.
                    ])
          , ppsMap = new ProcessedPropertiesSystemMap(
            Array.from(TypeClass.fields.keys()).map(modelFieldName=>{
                let prefix = GENERIC;
                if(exclude.has(modelFieldName))
                    prefix = null;
                else if(modelFieldName.endsWith('Color'))
                    prefix = COLOR;
                else if(modelFieldName === 'axesLocations')
                    // we should use a symbol here!
                    prefix = 'axesLocations/';
                return [modelFieldName,
                    (prefix === null)
                        ? null // don't make a UI for thiss
                        :ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName)];
            }).filter(([/*k*/, item])=>!!item)
        );

        const widgets = [
            [
                {
                    zone: 'main'
                }
              , []
              , StaticTag
              , 'h3'
              , {}
              , (typeSpecPath.equals(rootTypeSpecPath) ? 'Origin ': '') + `Type-Spec:`
            ]
          , [
                {
                    rootPath: typeSpecPath
                  , zone: 'main'}
              , [
                    ['label', 'value']
                ]
              , UILineOfTextInput
              , 'Label'
            ]

            // This should be set up using some kind of "template"
            // system, i.e.
            // - that fg/bf colors appear next to each other
            // - there's no double/multi defintion UI-widgets for the same item (label is defined above)
            // - some items don't require a widget, here maybe  `children` as
            //   those are already handled in the "Type-Spec Manager"
            // - autoOPSZ will be covered by UIManualAxesLocation and does
            //   not need extra handling
            // so far we have e.g. fontSize here and it's a NumberOrEmptyModel
            // but it says: Can't find generic UI-Element
            //
            // The template would need to describe
            //      which types to use/not use
            //      where to put them
            //      how to group or separate them
            //      NOTE however, the color-picker may be a nice example
            //      for existing grouping behavior.
          , [
                { rootPath: typeSpecPath}
              , []
              , UITypeDrivenContainer
                // widgetBus, _zones
              , this._zones
              , {
                    getDefaults: (ppsRecord, fieldName, /*BaseModelType.*/modelDefaultValue=_NOTDEF)=>{
                        const {fullKey} = ppsRecord;
                        if(ppsRecord.prefix === COLOR)
                            return getRegisteredPropertySetup(fullKey).default;
                        // These requests come via UIManualAxisLocations:
                        else if(ppsRecord.prefix === 'axesLocations/') {
                            // 'axesLocations/'. 'YTFI', '738'
                            return modelDefaultValue;
                        }
                        else {
                            // e.g. 'generic/', 'fontSize', null
                            return getRegisteredPropertySetup(fullKey).default/* propertyName, defaultVal=_NOTDEF)*/
                        }
                        if(modelDefaultValue !== _NOTDEF)
                            return modelDefaultValue;
                        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}".`);
                    }
                  , updateDefaultsDependencies: new Set()
                  , requireUpdateDefaults: (...args)=>{
                        // FIXME: it's probably important to
                        // know where this is going to be applied,
                        // some levels deep in a model, we can't go on
                        // with he same method. But also, more importantly
                        // different inerfaces may have different requirements
                        // as well!
                        // So, e.g. a level deeper, tj
                        // when this returns false, opsz is not updated in manualaxislocations
                        // when autoOPSZ is true.
                        console.log(`${this} injectable.requireUpdateDefaults(...`, ...args,`)`);
                        return true;
                    }
                }
              , ppsMap
              , 'Hello UITypeDrivenContainer'// label
            ]
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenWidgetBus, ...widgetArgs));
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult)
          , pathOrEmpty = changedMap.has('typeSpecPath')
                ? changedMap.get('typeSpecPath')
                : this.getEntry('typeSpecPath')
           , children = changedMap.has('children')
                ? changedMap.get('children')
                : this.getEntry('children')
           , rootPath = Path.fromString(this.widgetBus.getExternalName('rootTypeSpec'))
           , path = pathOrEmpty.isEmpty
                ? rootPath
                : rootPath.append('children', ...pathOrEmpty.value)
           , typeSpec = !pathOrEmpty.isEmpty
                  // If path can't be resolved actor becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                ? getEntry(children, pathOrEmpty.value, null)
                : this.getEntry('rootTypeSpec')
           , rebuild = changedMap.has('typeSpecPath')
           ;

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

        if(rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            widgetWrappers.push(...this._createTypeSpecWrappers(path, rootPath, typeSpec));
        }

        this._widgets.push(...widgetWrappers);
        for(const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}

class DependentValue {
    constructor(dependencyDepth, propertyName, defaultVal) {
        Object.defineProperties(this, {
            dependencyDepth: {value: dependencyDepth}
          , propertyName: {value: propertyName}
          , defaultVal: {value: defaultVal}
        });
    }
    toString() {
        return `[DependentValue ${this.propertyName}]`;
    }
}

/**
 * Name is a portmanteau from TypeSpec + Onion
 * Like the peels of an onion these typeSpec property generators can
 * be stacked together. The inner layers can access the values of
 * the outer layers.
 *
 * usage:
 *      outerTypeSpecnion = new TypeSpecnion(null, fontSizeGen);
 *      innerTypeSpecnion = new TypeSpecnion(outerTypeSpecnion, axisLocationsGen);
 */
export class LocalScopeTypeSpecnion {
    static _NOTDEF = _NOTDEF // jshint ignore:line
    constructor(propertiesGenerators, typeSpec) {
        this._propertiesGenerators = propertiesGenerators;
        this.typeSpec = typeSpec;
    }

    *_propertiesGenerator(propertiesWithDependeciesMap, typeSpec) {
        const _NOTDEF = this.constructor._NOTDEF;
        // dependencyDepth:
        // we can only try to resolve a dependencyDepth if is > 0, because
        // we're looking at dependencyDepth-1 to resolve.
        // this is a simplistic way to avoid analyzing the full dependency graph.
        // it's also, already, full overkill.
        function getProperty (dependencyDepth, propertyName, defaultVal=_NOTDEF) {
            return new DependentValue(dependencyDepth, propertyName, defaultVal);
        }
        for(const [dependencyDepth, gen] of this._propertiesGenerators.entries()) {
            for(const [propertyName, propertyValue] of gen(
                                    {getProperty: getProperty.bind(null, dependencyDepth)}
                                  , typeSpec)) {
                if(propertyValue instanceof DependentValue) {
                    // keeping the highest dependency depth, this means
                    // lower depths will be resolved before, so higher
                    // depths can depend on them. The order of _propertiesGenerators
                    // defines those depths: properties generated by earlier
                    // generators can be used as dependencies for properties
                    // of later generators.
                    const oldDependencyDepth = propertiesWithDependeciesMap.has(propertyName)
                                    ? propertiesWithDependeciesMap.get(propertyName)
                                    : -1
                      , dependencyDepth = Math.max(oldDependencyDepth, propertyValue.dependencyDepth)
                      ;
                    propertiesWithDependeciesMap.set(propertyName, dependencyDepth);
                }
                yield [propertyName, propertyValue];
            }
        }
    }

    /**
     * wipPropertyMap: this means the data is Work In Progress,
     * i.e. incomplete.
     */
    _resolveLocalPropertyDependency(dependantPropertyName, wipPropertyMap, dependentPropertyValue) {
        const {propertyName, defaultVal} = dependentPropertyValue;
        if(wipPropertyMap.has(propertyName)) {
            return wipPropertyMap.get(propertyName);
        }
        else if(defaultVal !== this.constructor._NOTDEF) {
            return defaultVal;
        }
        else
            throw new Error(`PROPERTY ERRROR can't resolve dependency property ${propertyName} for ${dependantPropertyName}`);
    }

    // FIXME: utterly broken!
    _resolvePropertyDependencies(rawPropertyMap, propertiesWithDependeciesMap) {
        const newPropertyMap = new Map()
          , orderedPropertiesWithDependecies = zip(...Array.from(propertiesWithDependeciesMap.entries()).sort(([, a],[, b])=>a-b)).next().value
          ;

        // These don't have dependencies and we can use them right away
        for(const [propertyName, propertyData] of rawPropertyMap.entries()) {
            if(!propertiesWithDependeciesMap.has(propertyName))
                // This data didn't change, just transfer it.
                newPropertyMap.set(propertyName, propertyData);
        }

        for(const propertyName of orderedPropertiesWithDependecies) {
            const propertyValue = rawPropertyMap.get(propertyName)
              , wipPropertyMap = new Map()
              ;
            if(!(propertyValue instanceof DependentValue)) {
                wipPropertyMap.set(propertyName, propertyValue);
                continue;
            }
            const newPropertyValue = this._resolveLocalPropertyDependency(propertyName, newPropertyMap, propertyValue);
            if(newPropertyValue === null)
                continue;
            newPropertyMap.set(propertyName, wipPropertyMap)
        }
        return newPropertyMap;
    }

    _getPropertyValuesMap() {
        // use this cache ???
        if(this._typeSpecPropertyMap === null) {
            const propertiesWithDependeciesMap = new Map()
              , propertyMap = new Map()
              ;
            // .something like this
            for(const [propertyName, propertyValue] of this._propertiesGenerator(this, propertiesWithDependeciesMap, this.typeSpec)) {
                propertyMap.set(propertyName, propertyValue);
            }
            this._typeSpecPropertyMap = propertiesWithDependeciesMap.size
                ? this._resolvePropertyDependencies(propertyMap, propertiesWithDependeciesMap)
                : propertyMap
                ;
        }
        return this._typeSpecPropertyMap;
    }

    toString() {
        return `[${this.constructor.name}+${this._propertiesGenerators.map(pg=>pg.name).join('+')}]`;
    }

    getPropertyValue(propertyName, defaultVal=super._NOTDEF) {
        const propertyMap = this._getPropertyValuesMap();
        if(!propertyMap.has(propertyName)) {
            if(defaultVal !== this.constructor._NOTDEF)
                return defaultVal;
            throw new Error(`KEY ERROR propertyName "${propertyName}" not found in ${this}.getPropertyValue`);
        }

        return propertyMap.get(propertyName);
    }

    getPropertyValuesMap() {
        return this._getPropertyValuesMap();
    }

    hasProperty(property) {
        // throw new Error(`NOT IMPLEMENTED hasProperty (for property ${property}) in ${this}.`);
        return this._propertyMap.has(property);
    }

    propertyNames() {
        // throw new Error(`NOT IMPLEMENTED propertyNames in ${this}.`);
        return Array.from(this._propertyMap.keys());
    }
}


export class HierarchicalScopeTypeSpecnion {
    static _NOTDEF = Symbol('_NOTDEF'); // jshint ignore:line

    constructor(localTypeSpecnion, parentTypeSpecnion=null, isInheritingPropertyFn=null) {
        // must be a HierarchicalScopeTypeSpecnion as well/same interface
        // typeSpecnion.parentTypeSpecnion => typeSpecnion || null
        Object.defineProperty(this, 'parentTypeSpecnion', {value: parentTypeSpecnion});
        Object.defineProperty(this, 'localTypeSpecnion', {value: localTypeSpecnion});
        if(parentTypeSpecnion !== null && !isInheritingPropertyFn)
            throw new Error('ASSERTION FAILED parentTypeSpecnion is not null but isInheritingPropertyFn is not set.');
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }

    toString() {
        return `[${this.constructor.name} local:${this.localTypeSpecnion}]`;
    }

    // getter that overrides itself in the instance
    get typeSpecnions() {
        const typeSpecnions = [];
        let current = this;
        while(current !== null) {
            typeSpecnions.unshift(current);
            current = current.parentTypeSpecnion;
        }
        Object.defineProperty(this, 'typeSpecnions', {value: typeSpecnions});
        return this.typeSpecnions;
    }

    _isInheritingProperty(property) {
        // By default all properties are inheriting, due to backward
        // compatibility, but we can inject different behavior.
        if(this._isInheritingPropertyFn)
            return this._isInheritingPropertyFn(property);
        return true;
    }

    getProperties() {
        const typeSpecnions = this.typeSpecnions
          , properties = new Map()
          ;
        // With this, we could also trace the level of inheritance for all
        // the properties!
        for(let i=typeSpecnions.length-1;i>=0;i--) {
            const typeSpecnion = typeSpecnion[i]
                // only "inherit" properties that we don't know already
                // also only inherit properties that are inherited
              , newProperties = typeSpecnion.localPropertyNames.filter(property=>!properties.has(property)
                        &&(typeSpecnion === this || this._isInheritingProperty(property))

                )
              ;
            for(const property of newProperties)
                properties.set(property, typeSpecnion.getOwnProperty(property));
        }
        return properties;
    }

    getOwnProperty(propertyName, defaultVal=super._NOTDEF) {
        if(!this.localTypeSpecnion.hasProperty(propertyName)) {
            if(defaultVal !== this.constructor._NOTDEF)
                return defaultVal;
            throw new Error(`KEY ERROR ${propertyName} not in {$this.constructor.name}.`);
        }
        const defaultArgs = defaultVal !== this.constructor._NOTDEF ? [defaultVal] : [];
        return this.localTypeSpecnion.getPropertyValue(propertyName, ...defaultArgs);
    }

    // typeSpecnion.localPropertyNames => Array, all names that are defined by this scope
    get localPropertyNames() {
        return this.localTypeSpecnion.propertyNames();
    }

    // compatibility to localTypeSpecnion API:
    getPropertyValuesMap() {
        return this.localTypeSpecnion.getPropertyValuesMap();
    }
}


export class TypeSpecLiveProperties extends _BaseComponent {
    constructor(widgetBus, initTypeSpecnion, isInheritingPropertyFn=null) {
        super(widgetBus);
        this._initTypeSpecnion = initTypeSpecnion;
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
        // only used if also hasParentProperties
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }

    /**
     * return an instance of TypeSpecnion
     * e.g:
     *      const outerTypeSpecnion =  new TypeSpecnion(null, outerPropertiesGenerator, typeSpec);
     *      return new TypeSpecnion(outerTypeSpecnion, innerPropertiesGenerator, typeSpec);
     *
     * (outerTypeSpecnion, propertiesGenerator, typeSpec);
     */
    _initTypeSpecnion(typeSpec, parentProperties=null) {
        // jshint unused:vars
        throw new Error(`NOT IMPLEMENTED _initTypeSpecnion(typeSpec:${typeSpec}, parentProperties:${parentProperties})`);
    }

    get typeSpecnion() {
        if(this._typeSpecnion === null)
            throw new Error('LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.');
        return this._typeSpecnion;
    }

    update(changedMap) {
        const hasParentProperties = this.widgetBus.wrapper.dependencyReverseMapping.has('@parentProperties');
        let typeSpecnionChanged = false
          , propertiesChanged = false
          ;
        if(changedMap.has('typeSpec') || changedMap.has('@parentProperties')) {
            const hasLocalChanges = changedMap.has('typeSpec')
              , typeSpec = changedMap.has('typeSpec')
                    ? changedMap.get('typeSpec')
                    : this.getEntry('typeSpec')
              ;
            if(hasParentProperties) {
                const parentProperties = changedMap.has('@parentProperties')
                        ? changedMap.get('@parentProperties')
                        : this.getEntry('@parentProperties')
                  , [localChanged, localScopeTypeSpecnion] = hasLocalChanges || this._typeSpecnion === null
                                ? [true, this._initTypeSpecnion(typeSpec)]
                                  //keep the old one
                                : [false, this._typeSpecnion.localTypeSpecnion]
                  , parentChanged = this._typeSpecnion === null || parentProperties.typeSpecnion !== this._typeSpecnion.parentTypeSpecnion
                  ;
                // Don't rebuild if the components haven't changed.
                if(localChanged || parentChanged) {
                    this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                                    localScopeTypeSpecnion
                                  , parentProperties.typeSpecnion
                                  , this._isInheritingPropertyFn
                                  );
                    typeSpecnionChanged = true;
                }
            }
            else {
                this._typeSpecnion =  new HierarchicalScopeTypeSpecnion(
                                    this._initTypeSpecnion(typeSpec));
                typeSpecnionChanged = true;
            }
        }

        if(typeSpecnionChanged) {
            this.propertyValuesMap = this._getPropertyValuesMap();
            propertiesChanged = true;
        }

         if(typeSpecnionChanged || propertiesChanged) {
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] = this.widgetBus.getProtocolHandlerRegistration(`typeSpecProperties@`);
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    _getPropertyValuesMap() {
        return this._typeSpecnion.getPropertyValuesMap();
    }

    getPropertyValuesMap() {
        return this.propertyValuesMap;
    }
}


class TypeSpecChildrenMeta extends _BaseDynamicCollectionContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
     constructor(widgetBus, zones, initTypeSpecnionFn, isInheritingPropertyFn
            , widgets=[]) {
        super(widgetBus, zones, widgets);
        this._initTypeSpecnionFn = initTypeSpecnionFn;
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        console.log(`${this}._getActorWidgetSetup rootPath ${rootPath}`);
        return [
            {
                rootPath
            }
          , [
                // parent is always two levels above from here
                // as this is children/{index}
              , [`typeSpecProperties@${rootPath.append('..', '..')}`, '@parentProperties']
            ]
          , TypeSpecMeta
          , this._zones
          , this._initTypeSpecnionFn, this._isInheritingPropertyFn
        ];
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getWidgetSetup(rootPath)
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}


/**
 * It's smarter to build the AnimationLiveProperties (and possibly other "meta data")
 * structure independent from StageHTML, as we may have different rendereing
 * targets, but the property propagation can and should be shared across.
 * Also, having the animationProperties@ registry relative to the top controller
 * of this module -- i.e. global -- makes this simple.
 */
export class TypeSpecMeta extends _BaseContainerComponent {
    constructor(widgetBus, zones, initTypeSpecnionFn, isInheritingPropertyFn) {
        const widgets = [
            [
                {
                    'typeSpecProperties@': widgetBus.rootPath.toString()
                }
              , [  ...widgetBus.wrapper.getDependencyMapping(widgetBus.wrapper.constructor.DEPENDECIES_ALL) ]
              , TypeSpecLiveProperties
              , initTypeSpecnionFn // This usage instance won't receive parentProperties.????
              , isInheritingPropertyFn
            ]
          , [
                {}
              , [
                    ['children', 'collection']
                ]
              , TypeSpecChildrenMeta
              , zones
              , initTypeSpecnionFn
              , isInheritingPropertyFn
              , [] // widgets
            ]
        ];
        super(widgetBus, zones, widgets);
        console.log(`${this} widgetBus.rootPath: ${widgetBus.rootPath}`);
    }
}


class TypeSpecRampController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        // BUT: we may need a mechanism to handle typeSpec inheritance!
        // widgetBus.wrapper.setProtocolHandlerImplementation(
        //    ...SimpleProtocolHandler.create('animationProperties@'));
        const typeSpecManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'type_spec-manager'})
          , propertiesManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'properties-manager'})
          , zones = new Map([..._zones, ['type_spec-manager', typeSpecManagerContainer]
                , ['properties-manager', propertiesManagerContainer]])
          ;
        // widgetBus.insertElement(stageManagerContainer);
        super(widgetBus, zones);

        collapsibleMixin(typeSpecManagerContainer, 'legend');
        collapsibleMixin(propertiesManagerContainer, 'legend');

        const widgets = [
            [
                {zone: 'main'}
              , []
              , StaticNode
              , typeSpecManagerContainer
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , propertiesManagerContainer
            ]
          , [
                {zone: 'type_spec-manager'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'TypeSpec Manager'
            ]
          , [
                {zone: 'type_spec-manager'}
              , [
                    ['typeSpec/children', 'activeActors']
                  , ['editingTypeSpec', 'editingActor']
                ]
               , TreeEditor
            ]
          , [
                {
                    zone: 'type_spec-manager'
                }
              , []
              , SelectAndDragByOptions
              , 'Create'
              , ''//'drag and drop into Rap-Editor.'
              , [ // options [type, label, value]
                    [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE, 'Type Spec', 'TypeSpec']
                  , ...[...availableStylePatchTypes].map(
                        ([key, availableType])=>[DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_CREATE, `Style Patch: ${availableType.get('label').value}`, key])
                ]
            ]
          , [
                {
                    zone: 'type_spec-manager'
                }
              , [
                    ['typeSpec/children', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Delete'
              , ''//'drag and drop into trash-bin.'
              , [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH]
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
                {}
              , [
                    ['editingTypeSpec', 'typeSpecPath']
                  , ['typeSpec/children', 'children']
                  , ['typeSpec', 'rootTypeSpec']
                ]
              , TypeSpecPropertiesManager
              , new Map([...zones, ['main', propertiesManagerContainer]])
            ]
        ];
        this._initWidgets(widgets);
    }
}

export {
    TypeSpecRampModel as Model
  , TypeSpecRampController as Controller
};
