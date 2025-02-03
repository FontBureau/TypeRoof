/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    zip
  , identity
} from '../../util.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , _CommonContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseDynamicMapContainerComponent
  , HANDLE_CHANGED_AS_NEW
  , SimpleProtocolHandler
  , _UIBaseMap
} from '../basics.mjs';

import {
    collapsibleMixin
  , StaticNode
  , StaticTag
  , UILineOfTextInput
  , DynamicTag
  , PlainSelectInput
  , WasteBasketDropTarget
  , _BaseDropTarget
} from '../generic.mjs';

import {
    PathModelOrEmpty
  , Path
  , getEntry
  , FreezableSet
  , _AbstractStructModel
  , _AbstractListModel
  , StringModel
  , CoherenceFunction
  , ForeignKey
} from '../../metamodel.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    StylePatchesMapModel
  , TypeSpecModel
  , availableStylePatchTypes
  , createStylePatch
  , validateStyleName
} from '../type-spec-fundamentals.mjs';

import {
    ColorModel
  , getColorModelFields
  , colorPropertyGen
  , getColorFromPropertyValuesMap
} from '../color.mjs';

import {
    DATA_TRANSFER_TYPES
} from '../data-transfer-types.mjs';

import {
    SelectAndDragByOptions
} from './stage-and-actors.mjs';

import {
    UIshowProcessedProperties
} from '../processed-properties.mjs'

import {
    UITypeDrivenContainer
  , ProcessedPropertiesSystemMap
} from '../type-driven-ui.mjs'

import {
    getRegisteredPropertySetup
  , isInheritingPropertyFn
} from '../registered-properties.mjs';

import {
    COLOR
  , GENERIC
  , SPECIFIC
  , childrenPropertiesBroomWagonGen
} from '../registered-properties-definitions.mjs';

import {
    StringOrEmptyModel
} from '../actors/models.mjs';

import {
  // getPropertyValue
    actorApplyCSSColors
  , actorApplyCssProperties
  //, DYNAMIC_MARKER
  //, cssPositioningHorizontalPropertyExpander
  , setTypographicPropertiesToSample
} from '../actors/properties-util.mjs';

import {
    FontSelect
} from '../font-loading.mjs';


const StyleLinkOrEmptyModel = StringOrEmptyModel
  , TypeSpecLinkModel = StringModel
  , TextRunModel = _AbstractStructModel.createClass(
        'TextRunModel'
      , ['stylePatchLinkOrEmpty', StyleLinkOrEmptyModel] // Empty for default Style.
      , ['text', StringModel]
    )
    // Consecutive runs with the same 'styleLinkOrEmpty' should be joined
    // and there should be no difference in their appearance.
  , TextRunsModel = _AbstractListModel.createClass('TextRunsModel', TextRunModel)
  , DocumentSegmentModel = _AbstractStructModel.createClass(
        'DocumentSegmentModel'
        // semantic type e.g. <p> <h1> - <h6>,
        // could also be part of the typeSpec, maybe we could in here
        // optionally override the <tag>, but typographically all decisions
        // are made in the typeSpec system and thus the visual hierarchy/semantic
        // is already decided there. This information though is equivalent with
        // a block level tag, an inline-level tag would be specified in TextRunModel
        //  by the stylePatch system, via styleLinkOrEmpty
        // , ['stylePatchLinkOrEmpty', StyleLinkOrEmptyModel] // Empty for raw/default Style of the typeSpec.
      , ['typeSpecLink', TypeSpecLinkModel]
      // I'd rather like to attach this to the typeSpec/stylePatch system
      // as the typographic treatment has to change with the language and
      // script and region. e.g. different font, different space
      // treatment etc.
      //
      // For example, if you use the locale fr-Arab-ER, it indicates:
      //    Language: French (fr)
      //    Script: Arabic (Arab)
      //    Region: Eritrea (ER)
      // SEE BCP 47 (Best Current Practice 47)
      // but maybe we can also use a subset of BCP 47 as e.g.
      // "gsw-u-sd-chzh", Zurich German, supresses Latn as script tag,
      // and that seems odd in a highly typographic context like this.
      //  * gsw: This is the primary language subtag, which stands for Swiss German.
      //  * u: This indicates that the following subtags are Unicode extension subtags.
      //  * sd: This stands for "subdivision" and is used to specify a regional subdivision.
      //  * chzh: This denotes the Zurich subdivision within Switzerland (CH stands for Switzerland and ZH for Zurich).
      // The tag "gsw-u-sd-chzh" specifies Swiss German as spoken in the
      // Zurich region. The reason Latn (for Latin script) is not included
      // is because Swiss German (gsw) is already commonly understood to
      // be written in the Latin script, so it might be considered redundant
      // in this context.
      // However, if you want to include the script explicitly, you can
      // add it like this: "gsw-Latn-u-sd-chzh". This version explicitly
      // specifies that Swiss German is written in the Latin script in
      // the Zurich region.
      // , ['locale']
      , ['textRuns', TextRunsModel]
    )
  , DocumentSegmentsModel = _AbstractListModel.createClass('DocumentSegmentsModel', DocumentSegmentModel)
  , DocumentModel = _AbstractStructModel.createClass(
        'DocumentModel'
       , ['segments', DocumentSegmentsModel]
         // only to bootstrap, until we can deserialize a ready made document.
       , CoherenceFunction.create(
            ['segments']
          , function initSegments({segments}) {
                const segmentsData =  [
                    ['H2', 'Heading Two']
                  , ['H3', 'Heading Three']
                  , ['T1', 'Intro text leads reader into the article by the nose, with grace and dignity and a little pithy charm. Typeface has changed to the appropriate optical size by the miracle of modern typography.']
                  , ['T2', 'Johannes Gutenberg’s work on the printing press began in approximately 1436 when he partnered with Andreas Heilmann, owner of a paper mill. Having previously worked as a goldsmith, Gutenberg made skillful use of the knowledge of metals he had learned as a craftsman. He was the first to make type from an alloy of lead, tin, and antimony, which was critical for producing durable type that produced high-quality printed books and proved to be much better suited for printing than all other known materials.']
                  , ['T2', 'Επειδη δε κοινη το των Αρκαδων εθνος εχει τινα παρα πασι τοις Ελλησιν επ αρετη φημην, ου μονον δια ρην εν τοις ηθεσι και βιοις φιλοξενιαν και φιλανθρωπιαν, μαλιστα δε δια την εις το θειον ευσεβειαν, αξιον βραχυ διαπορησαι περι της Κυναιθεων αγριοτητος, πως οντες ομολογουμενως Αρκαδες τοσουτο κατ εκεινους τοθς καιπους διηνεγκαν των αλλων Ελληνων ωμοτητι και παρανομια. δοκαυσι δε μοι, διοτι τα καλως υπο των αρχαιων επινενοημενα και φυσικως συντεθεωρημενα περι παντας τους κατοικουντας την Αρκαδιαν, ταυτα δη πρωτοι και μονοι Αρκαδων εγκατελιπον. μουσικην γαρ, την γ αληθως μουσικην, πασι μεν ανθρωποις οφελος ασκειν Αρκασι δε και αναγκαιον. ου γαρ ηγητεον μουσικην, ως Εφορος φησιν εν τω προοιμιω της ολης προγματειας, ουδαμως αρμοζοντα λογον αυτω πιψας, επ απατη και γοητεια παραισηχθαι τοις ανθρωποις, ουδε τους παλαιοθς Κρητων και Λακεδαιμονιων αυλον και ρυθμον εις τον πολεμον αντι σαλπιγγος εικη νομιστεον εισαγαγειν, ουδε τους πρωτους Αρκαδων εις την ολην πολιτειαν την μοθσικην παραλαβειν επι τοσουτον ωστε μη μονον παισιν ουσιν, αλλα ακι νεανισκοις γενομενοις εως τριακοντ ετων κατ αναγκην ουντροφον ποιειν αυτην, ταλλα τοις βιοις οντας αυστηροτατους.']
                  , ['T2', 'В глубоких и темных водах Антарктики ученые обнаружили невероятное изобилие до сих пор неизвестных видов морской жизни. Исследователи открыли более 700 новых видов морских существ в морях, которые раньше считались слишком неблагоприятными для существования большого биологического разнообразия. Эти темные воды буквально кишат стаями хищных губок, свободноплавающих червей, ракообразных и моллюсков. Доклад о новых видах фауны был опубликован в журнале Nature. “То, что раньше считалось пустой бездной, на поверку оказалось динамичной, меняющейся и биологически богатой средой”, - сказала одна из соавторов документа, морской биолог Британского общества исследования Антарктики доктор Кэтрин Линс. “Находка этой сокровищницы морской живности - наш первый шаг на пути к пониманию сложного взаимоотношения глубоких океанов и распределения морской жизни”, - добавила она. Науке это пока неизвестно. Исследование антарктических вод было проведено в рамках проекта Andeep, изучающего биологическое разнообразие глубоководного антарктического дна. Один из ранее неизвестных ракообразных (Cylindrarcturus), найденных в Антарктитке Исследователи не ожидали обнаружить такого разнобразия морской жизни Проект призван заполнить “вакуум знаний” о фауне, населяющей самые глубокие воды Южного океана.']
                  , ['T2', '我的征途是星辰大海 "My Conquest is the Sea of Stars", a famous sentence in Legend Of The Galactic Heroes']
                  , ['T2', '很久很久以前，在一个遥远的星系 "A long time ago in a galaxy far, far away", a famous sentence in Star Wars']
                ];
                console.log(`${this} (initSegments) segments: ${segments}`, segments.size);
                if(segments.size === 0) {
                    for(const [/*type*/, text] of segmentsData) {
                        const segment = segments.constructor.Model.createPrimalDraft(segments.dependencies)
                          , textRuns = segment.get('textRuns')
                          , textRun = textRuns.constructor.Model.createPrimalDraft(segment.dependencies)
                          ;
                        textRun.get('text').value = text;
                        textRuns.push(textRun);
                        segments.push(segment);
                    }
                }
            }
        )
    )
  ;


    //  We can't create the self-reference directly
    //, TypeSpecModelMap: TypeSpec.get('children') === _AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpec)
const TypeSpecRampModel = _BaseLayoutModel.createClass(
        'TypeSpecRampModel'
        // The root TypeSpec
      , ['typeSpec', TypeSpecModel]
      , ['editingTypeSpec', PathModelOrEmpty]
        // could potentially be a struct with some coherence logic etc.
        // for the actual data
      , ['stylePatchesSource', StylePatchesMapModel]
        // the root of all typeSpecs
      , ['document', DocumentModel]
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

class UIFontLabel extends DynamicTag {
    constructor(widgetBus, ppsRecord, tag, attr, formatter=identity, initialContent='(initializing)') {
        super(widgetBus, tag, attr, formatter, initialContent);
        this._ppsRecord = ppsRecord;
    }
    update(changedMap) {
        if(changedMap.has('rootFont') || changedMap.has('properties@') ) {
            const propertyValuesMap = (changedMap.has('properties@')
                    ? changedMap.get('properties@')
                    : this.getEntry('properties@')).typeSpecnion.getProperties()
              , font = (propertyValuesMap.has(this._ppsRecord.fullKey))
                    ? propertyValuesMap.get(this._ppsRecord.fullKey)
                    // rootFont can't be ForeignKey.NULL
                    : this.getEntry('rootFont').value
              ;
            const inherited = this.getEntry('font') === ForeignKey.NULL;
            this.element.textContent = this._formatter(font, inherited);
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
            Array.from(TypeClass.fields.entries()).map(([modelFieldName, modelFieldType])=>{
                let prefix = GENERIC;
                if(exclude.has(modelFieldName))
                    prefix = null;
                else if(modelFieldType === ColorModel)
                    prefix = COLOR;
                else if(modelFieldName === 'axesLocations')
                    // we should use a symbol here!
                    prefix = 'axesLocations/';
                else if(modelFieldName === 'stylePatches')
                    prefix = 'stylePatches/';
                return [modelFieldName,
                    (prefix === null)
                        ? null // don't make a UI for thiss
                        :ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName)];
            }).filter(([/*k*/, item])=>!!item)
        );

        // Not sure how this is exactly needed/used
        // It seems like this is to capture and react to changes
        // in a parent, but so far, the parent can't be changed
        // because only one ui is visible at any time. Anyways
        // A change in a parent is only transported via typeSpecProperties@
        // but it's possible that we should reference the parent
        // typeSpecProperties@ here rather than the own.
        // require a parent animationProperties@ reference?
        // In stage-and-actors we find>
        //      this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // In TypeSpecChildrenMeta we find:
        //       [`typeSpecProperties@${rootPath.append('..', '..')}`, '@parentProperties']
        const typeSpecPropertiesKey = `typeSpecProperties@${typeSpecPath.append('..', '..')}`
          //, updateDefaultsDependencies = [
          //      // [this._animationPropertiesKey, 'animationProperties@']
          //      // ['typeSpecProperties@', 'typeSpecProperties@']
          //      [typeSpecPropertiesKey, 'typeSpecProperties@']
          //  ]
          //, _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = (/*changedMap*/)=>{
                // FIXME: in this context, this method seems broken!
                // for once, it contains e.g. `value` as key in changedMap
                // but without calling context, it's not possible to turn
                // that into a more meaningful key.
                // Also, in UIManualAxesLocations opsz/autopsz is not properly
                // initialized when this returns false.
                // Since we are not in an animation context, we may
                // get away with always returning true, without a big
                // performance hit.

                // const result = Array.from(changedMap.keys())
                //                         .some(name=>_updateDefaultsNames.has(name));
                // console.warn(`>>>${this} requireUpdateDefaults ${result} changedMap:`, changedMap);
                // return result;
                return true;
            }
          , getDefaults = (ppsRecord, fieldName, /*BaseModelType.*/modelDefaultValue=_NOTDEF)=>{
                const {fullKey} = ppsRecord
                      // When this is the root typeSpec we get a KEY ERROR:
                      //    via VideoproofController constructor initial resources:
                      //    Error: KEY ERROR not found identifier "typeSpecProperties@"
                      //    in [ProtocolHandler typeSpecProperties@]:
                      //    typeSpecProperties@/activeState/typeSpec.
                      // FIXME: We should rather get the own typeSpecProperties@ and then
                      // see if it defines itself a parent. Better then hard-coding the
                      // parent path in here.
                    , liveProperties = typeSpecPropertiesKey === 'typeSpecProperties@'
                            ? null
                            : this.getEntry(typeSpecPropertiesKey)
                    , propertyValues = liveProperties !== null
                            ? liveProperties.typeSpecnion.getProperties()
                            : new Map()
                    ;
                // console.log(`${this}getDefaults ${ppsRecord} fieldName: ${fieldName} modelDefaultValue`, modelDefaultValue
                //     , '\n   typeSpecPropertiesKey:', typeSpecPropertiesKey
                //     , '\n   propertyValues:', propertyValues
                //     );
                // FIXME: it's interesting that we so not use the liveProperties
                // in comparable functions in stage-and-actors, however,
                // this here seems to behave fine.
                if(ppsRecord.prefix === COLOR) {
                    const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
                    if(color !== null)
                        return color;
                    // If defaultVal === _NOTDEF and fullKey is not found
                    // this will raise.
                    const fallback = getRegisteredPropertySetup(fullKey, modelDefaultValue === _NOTDEF
                            ? getRegisteredPropertySetup.NOTDEF
                            : modelDefaultValue
                            );
                    return fallback === modelDefaultValue
                        ? modelDefaultValue
                        : fallback.default
                        ;
                }
                // These requests come via UIManualAxisLocations:
                else if(ppsRecord.prefix === 'axesLocations/') {
                    // 'axesLocations/'. 'YTFI', '738'
                    const key = `${ppsRecord.prefix}${fieldName}`
                      , result = propertyValues.has(key)
                            ? propertyValues.get(key)
                            : modelDefaultValue
                            ;
                    if(result === _NOTDEF)
                         throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}".`);
                    return result;
                }
                else if(ppsRecord.prefix === SPECIFIC) {
                    // Introducing 'SPECIFIC', which in contrast to
                    // GENERIC requires modelDefaultValue and cannot
                    // be acquired via getRegisteredPropertySetup
                    // FIXME: we don't use this case far anyymore!!! (we use the SPECIFIC prefix though)
                    const result = propertyValues.has(fullKey)
                        ? propertyValues.get(fullKey)
                        : modelDefaultValue
                        ;
                    if(result === _NOTDEF)
                         throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}".`);
                    return result;
                }
                else {
                    // e.g. 'generic/', 'fontSize', null
                    return propertyValues.has(fullKey)
                        ? propertyValues.get(fullKey)
                        // this will raise.
                        : getRegisteredPropertySetup(fullKey).default/* propertyName, defaultVal=_NOTDEF)*/
                        ;
                }
                if(modelDefaultValue !== _NOTDEF)
                    return modelDefaultValue;
                throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}".`);
            }
          ;
        // console.log(`${this}updateDefaultsDependencies = `, updateDefaultsDependencies)
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
          , [
                {
                    rootPath: typeSpecPath
                  , zone: 'main'
                }
              , [
                    'font' // requires local font only to indicate inheritance
                    // especially, so far, for this, it would be
                    // maybe better to get the rootFont via a primal
                    // typeSpecnion, rather than via a last reserver
                    // query into the model. Especially because there
                    // will always be the /font. For the other
                    // properties, however, it could be handled similarly,
                    // not having to query getDefaults ...
                  , ['/font', 'rootFont']
                  , ['typeSpecProperties@', 'properties@']
                ]
              , UIFontLabel
              , ProcessedPropertiesSystemMap.createSimpleRecord(SPECIFIC, 'font')
              , 'span', {}
              , (font, inherited=false)=>{
                    return `${font.nameVersion}` + (inherited ? ' (inherited)' : '')
                }
            ]
          , [
                {
                    rootPath: typeSpecPath
                  , zone: 'main'
                }
              , [
                    ['/availableFonts', 'options']
                  , 'activeFontKey'
                ]
              , FontSelect
              , true
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
            // FIXME: Half way there.
            // The template would need to describe
            //      which types to use/not use
            //      where to put them
            //      how to group or separate them
            //      NOTE however, the color-picker may be a nice example
            //      for existing grouping behavior.
          , [
                { rootPath: typeSpecPath
                }
              , []
              , UITypeDrivenContainer
                // widgetBus, _zones
              , this._zones
              , {
                    getDefaults: getDefaults
                    // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
                    //          via VideoproofController constructor initial resources: Error:
                    //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
                    //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
                    // Maybe this key is flawed in this context?
                  , updateDefaultsDependencies: []//updateDefaultsDependencies
                  , requireUpdateDefaults: requireUpdateDefaults
                }
              , ppsMap
              , 'Hello UITypeDrivenContainer'// label
            ]
          , [
                {
                    rootPath: typeSpecPath
                  , zone: 'main'
                }
              , [
                    ['.', 'referenceItem']
                  , ['typeSpecProperties@', 'properties@']
                    // This is probably not required for the CommonActorProperties at all.
                ]
              , UIshowProcessedProperties
              , 'Type-Spec'
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

class SimpleSelect extends _BaseComponent {
    constructor(widgetBus, label, items, changeHandler=null) {
        super(widgetBus);
        this._ui = new PlainSelectInput(this._domTool, changeHandler, label, items);
        this._insertElement(this._ui.element);
    }
    get value() {
        return this._ui._input.value;
    }
}

class UIStylePatchesMap extends _UIBaseMap {
    // jshint ignore: start
    static ROOT_CLASS = `ui_style_patches_map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS]
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_ADD_BUTTON_LABEL = 'add style patch';
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH;

    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if(!valid)
            return [valid, message];
        return validateStyleName(key);
    }

    get _initialWidgets() {
        const items = Array.from(availableStylePatchTypes).map(([key, availableType])=>[key, availableType.get('label').value])
          , select = [
                {   zone: 'tools'
                  , id: 'key-create-type-select'
                }
              , []
              , SimpleSelect
              , null
              , items
            ]
          ;
        const widgets = super._initialWidgets;
        widgets.splice(1, 0, select);
        return widgets;
    }
    // jshint ignore: end
    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                relativeRootPath: Path.fromParts('.', key, 'instance')
              , zone: keyId // required to check if widgetWrapper.host === host
            }
          , dependencyMappings = [['../stylePatchTypeKey', 'data']]
             // Should be a really simple item maybe displaying the label
             // Maybe we could edit the label.
             // But rather it is just to select, on click and to display
             // as selected, e.g. bold label
          , Constructor = DynamicTag
          , args = [
                'span', {'class': 'ui_style_patches_map-item-value'}
              , function(typeKey) {
                    const typeLabel = availableStylePatchTypes.get(typeKey).get('label').value;
                    return `${typeLabel}`;
                }
            ]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _createKeyValue(childrenOrderedMap) {
        const typeSelect = this.getWidgetById('key-create-type-select')
          , typeKey = typeSelect.value
          , value = createStylePatch(typeKey, childrenOrderedMap.dependencies);
          ;
        return value;
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
        this._typeSpecPropertyMap = null;
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
            for(const [propertyName, propertyValue] of this._propertiesGenerator(
                                 propertiesWithDependeciesMap, this.typeSpec)) {
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
        return this.getPropertyValuesMap().has(property);
    }

    propertyNames() {
        // throw new Error(`NOT IMPLEMENTED propertyNames in ${this}.`);
        return Array.from(this.getPropertyValuesMap().keys());
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
            const typeSpecnion = typeSpecnions[i]
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

/**
 * FIXME: these generators and the generators in stage-and-actors should
 * be synced. So far these are pretty much copies of the ones in
 * stage-and-actors, however, those also get `momentT` passed as an argument
 * and at least the axisLocationsGen also uses it. Keeping the implementations
 * apart/duplicated for the moment, to not get caught in handling wrong
 * assumptions of similarity.
 * However, eventually, all properties (as in processes properties system)
 * should be defined and handled similarly to increase the compatibility
 * between the sub-systems.
 */

function* colorsGen(outerAnimanionAPI, hostInstance/* here a TypeSpecModel */) {
    for(const fieldName of getColorModelFields(hostInstance.constructor)) {
        const color = hostInstance.get(fieldName);
        yield* colorPropertyGen(fieldName, color);
    }
}

function* fontGen(outerAnimanionAPI, hostInstance/* here a TypeSpecModel */) {
    const font = hostInstance.get('font');
    if(font !== ForeignKey.NULL){
        console.log(`fontGen yield`, `${SPECIFIC}font`, font.value);
        yield [`${SPECIFIC}font`, font.value];
    }
}

/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 *
 */
function* fontSizeGen(outerAnimanionAPI, hostInstance/* here a TypeSpecModel */) {
    const fontSize = hostInstance.get('fontSize');
    if(!fontSize.isEmpty)
        yield [`${GENERIC}fontSize`, fontSize.value];
}

/**
 * hostInstance implements manualAxesLocationsModelMixin
 *              and fontSize
 * yield [propertyName, propertyValue]
 */
function* axisLocationsGen(outerAnimanionAPI, hostInstance/* here a TypeSpecModel */) {
      // fontSize = hostInstance.get('fontSize')
      // => this is interesting, if hostInstance defines fontSize, we
      //    definitely use that, otherwise, going only via
      // outerAnimanionAPI.getProperty(`${GENERIC}fontSize`)
    const autoOPSZ = hostInstance.get('autoOPSZ').value;
    if(autoOPSZ) {
        const fontSize = hostInstance.get('fontSize')
          , fontSizeValue = fontSize.isEmpty
                  // this requires full calculation of the fontSize property animation!
                ? outerAnimanionAPI.getProperty(`${GENERIC}fontSize`, null)
                : fontSize.value
          ;
        if(fontSizeValue !== null)
            yield [`axesLocations/opsz`, fontSizeValue];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = hostInstance.get('axesLocations');
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

// FIXME: There's another way specified in here to identify
// fields as GENERIC. But also, i.e. fontSizeGen already yields
// `${GENERIC}fontSize` so this should not!!!
const REGISTERED_GENERIC_TYPESPEC_FIELDS = Object.freeze(new FreezableSet([
    // script+language!
    'textAlign', 'direction'
]));
function* genericPropertiesBroomWagonGen(outerAnimanionAPI, hostInstance) {
    for(const fieldName of hostInstance.keys()) {
        if(!REGISTERED_GENERIC_TYPESPEC_FIELDS.has(fieldName))
            continue;
        const item = hostInstance.get(fieldName)
          , path = Object.freeze([fieldName])
          ;
        yield* childrenPropertiesBroomWagonGen(outerAnimanionAPI, GENERIC, path, item);
    }
}

export function initTypeSpecnion(typeSpec) {
    const propertiesGenerators = [
            // numericPropertiesGen
            colorsGen
          , fontGen
          , fontSizeGen // must come before axisLocationsGen
          , axisLocationsGen
          , genericPropertiesBroomWagonGen
    ];
    return new LocalScopeTypeSpecnion(propertiesGenerators, typeSpec);
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
        console.log(`${this}.update:`, ...changedMap.keys());
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


class TypeSpecChildrenMeta extends _BaseDynamicMapContainerComponent {
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
        return [
            {
                rootPath
            }
          , [
                ['.', 'typeSpec']
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
    }
}


// I'm unsure about this, as the parent node can (and probably should from
// time to time) call normalize() and then this.node may become disconnected.
// I.e. this part of the model may be better handled directly in UIDocumentTextRuns
// or UIDocumentSegment than with it's own component.
class UIDocumentTextRun extends _BaseComponent {
    constructor(widgetBus, tag, attr, initialContent='(initializing)') {
        super(widgetBus);
        this.node = this._domTool.createTextNode(initialContent);
        this._insertElement(this.node);
    }
    update(changedMap) {
        if(changedMap.has('textRun'))
            this.node.data = changedMap.get('textRun').get('text').value;
    }
}

// the default could even be a DOM TextNode, but if there's a
// StylePatch, it would be a <span>/<strong>/<em> etc.
// For a '<a>' we'd have to add e.g. a "href" field, so at some
// point there has to be more complexity.
class UIDocumentTextRuns extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
    }
    _createWrapper(rootPath) {
        const settings = {
               // document/segments/{key}/textRuns/{key}
               rootPath: rootPath
             , zone: 'segment'
            }
          , dependencyMappings = [
                ['.', 'textRun']
            ]
          , Constructor = UIDocumentTextRun
          , args = [this._zones]
          , childWidgetBus = this._childrenWidgetBus
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

export class UIDocumentSegmenTypeSpecDropTarget extends _BaseDropTarget {
    static BASE_CLASS = 'ui_document_segment_typespec';
    _dropHandlerImplementation(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        return this._changeState(()=>{
            const typeSpecLink = this.getEntry('typeSpecLink');
            typeSpecLink.value = event.dataTransfer.getData(type);
            // if anything needs to change immediately, here would be
            // a chance to invoke a callback. OR, maybe, a CoherenceFunction
        });
    }
}

class UIDocumentSegmentTypeSpecStyler extends _BaseComponent{
    constructor(widgetBus, element) {
        super(widgetBus);
        this.element = element;
    }
    update(changedMap) {
        const propertiesData = [
                ['numericProperties/line-height-em', 'line-height', 'em']
                // NOTE: transform should have a much more complete interface!
              , ['generic/textAlign', 'text-align', '']
              , ['generic/direction', 'direction', '']
            ]
          , propertyValuesMap = (changedMap.has('properties@')
                        ? changedMap.get('properties@')
                        : this.getEntry('properties@')).typeSpecnion.getProperties()
          ;


        console.log(`${this}.update propertyValuesMap:`, ...propertyValuesMap.keys());
        if(changedMap.has('rootFont') || changedMap.has('properties@')) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const fontPPSRecord = ProcessedPropertiesSystemMap.createSimpleRecord(SPECIFIC, 'font')
            const font = (propertyValuesMap.has(fontPPSRecord.fullKey))
                    ? propertyValuesMap.get(fontPPSRecord.fullKey)
                    // rootFont can't be ForeignKey.NULL
                    : this.getEntry('rootFont').value
              ;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
            this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
            this.element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
            this.element.style.setProperty('--descender', `${font.fontObject.descender}`);
        }


        if(changedMap.has('properties@')) {
              // , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
            const colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              , getDefault = property => {
                    return [true, getRegisteredPropertySetup(property).default];
                }
              ;
            console.log(`${this}.update propertyValuesMap ...`, ...propertyValuesMap.keys(), '!', propertyValuesMap);
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
            setTypographicPropertiesToSample(this.element, propertyValuesMap);
        }
    }
}

// This should already inject it's own e.g. <p> element
// It's interesting, as the "segmentContainer" might have
// to change when the typeSpec changes! Thus, creating segmentContainer
// in the constructor might be not ideal.
// definitely must look at the 'segment'/'typeSpec@' in update.
//
// we could just copy all the content nodes when we change the segmentContainer
// a child, thus, should not save hte parent container ever.
// Interesting how/if insertElement plays along.
class UIDocumentSegment extends _BaseContainerComponent {
    // when typeSpecLink changes we need to update segmentContainer
    // when the linked typeSpec changes, we also need to update segmentContainer
    // it is interesting, that we add
    // "segment" and 'textRuns' to the dependencyMappings, as this kind of
    // component doen't use them.
    // This also means, that we should be able, on update, to
    // resolve the typeSpecLink link and see if it changed and if we need
    // to update.
    //
    // It could be an option to replace a SegmentWidget depending on the
    // typeSpecLink value, i.e. to recreate the SegmentWidget when the
    // link changes.

    constructor(widgetBus, _zones, originTypeSpecPath, baseClass='typeroof-document-segment') {
        const segmentContainer = widgetBus.domTool.createElement('div', {'class': baseClass})
          , localContainer = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones
                , ['segment', segmentContainer], ['local', localContainer]
            ])
          ;
        localContainer.append(segmentContainer);
        widgetBus.insertElement(localContainer);
        super(widgetBus, zones);
        this._originTypeSpecPath = originTypeSpecPath;
        this._typeSpecStylerWrapper = null;
        const widgets = [
            [
                {zone: 'local'}
              , [
                    'typeSpecLink'
                ]
              , UIDocumentSegmenTypeSpecDropTarget
              , 'drop TypeSpec'
              , ''
              , [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH]
            ]
          , [
                {   zone: 'segment'
                  , relativeRootPath: Path.fromParts('.', 'textRuns')
                }
              , [
                    ['.', 'collection']
                ]
              , UIDocumentTextRuns
              , this._zones
            ]
        ];
        this._initWidgets(widgets);
    }

    _getBestTypeSpecProperties() {
        const currentTypeSpecLink = this.getEntry('typeSpecLink').value
          , currentTypeSpecPath = Path.fromString(currentTypeSpecLink)
          , format = path=>`typeSpecProperties@${path}`
          , protocolHandlerImplementation = this.widgetBus.getProtocolHandlerImplementation('typeSpecProperties@', null)
          ;
        if(protocolHandlerImplementation === null)
            throw new Error(`KEY ERROR ProtocolHandler for identifier "typeSpecProperties@" not found.`);

        // getProtocolHandlerImplementation
        let testPath = currentTypeSpecPath.parts.length === 0 || currentTypeSpecPath.parts[0] === 'children'
                  // the initial "children" is part from typeSpecLink
                ? this._originTypeSpecPath.append(...currentTypeSpecPath)
                : this._originTypeSpecPath.append('children', ...currentTypeSpecPath)
                ;
        while(true) {
            if(!this._originTypeSpecPath.isRootOf(testPath))
                // We have gone to far up. This also prevents that
                // a currentTypeSpecPath could potentially inject '..'
                // to break out of this._originTypeSpecPath, though,
                // the latter seems unlikely, as we parse it in here.
                break;
            const typeSpecPropertiesId = format(testPath);
            if(protocolHandlerImplementation.hasRegistered(typeSpecPropertiesId))
                return typeSpecPropertiesId;
            // Move towards root and continue; // remove 'children' and `{key}`
            testPath = testPath.slice(0, -2);
        }
        return format(this._originTypeSpecPath);
    }

    _getNewTypeSpecStylerWrapper(typeSpecProperties) {
        const settings = {}
          , dependencyMappings = [
                [typeSpecProperties, 'properties@']
              , ['/font', 'rootFont']
            ]
          , Constructor = UIDocumentSegmentTypeSpecStyler
          , args = [this._zones.get('segment')]
          ;
         return this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _provisionWidgets(/* compareResult */) {
        // if typeSpecLink has changed or if if typeSpecProperties@ of id: 'type-spec-styler' does not exist
        //       get an existing typeSpecProperties@ for the new value
        //       existing means got back to root. originTypeSpecPath will exist
        //
        // if new typeSpecProperties !== old typeSpecProperties
        //       replace the widget
        //

        const typeSpecProperties = this._getBestTypeSpecProperties()
          , oldId = this._typeSpecStylerWrapper !== null
                ? this._widgets.indexOf(this._typeSpecStylerWrapper)
                : -1
          ;
        if(oldId === -1) {
            // inital
            this._typeSpecStylerWrapper = this._getNewTypeSpecStylerWrapper(typeSpecProperties);
            this._widgets.splice(0, 0, this._typeSpecStylerWrapper);
        }
        else {
            const oldWrapper = this._widgets[oldId];
            if(oldWrapper.dependencyReverseMapping.get('typeSpecProperties@') !== typeSpecProperties) {
                const newWrapper = this._getNewTypeSpecStylerWrapper(typeSpecProperties);
                this._widgets.splice(oldId, 1, newWrapper);
                oldWrapper.destroy()
                this._typeSpecStylerWrapper = newWrapper;
            }
        }
        return super._provisionWidgets();
    }
}

// It's interesting on the one hand, each segment requires it's own
// control, e.g. to change the typeSpecLink, on the other hand,
// it requires the data to render properly, and that is very depending
// on the settings.
class UIDocumentSegments extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, originTypeSpecPath) {
        super(widgetBus, zones);
        this._originTypeSpecPath = originTypeSpecPath;
    }
    _createWrapper(rootPath) {
        const settings = {
               // document/segments/{key}
               rootPath: rootPath
             , zone: 'document'
            }
          , dependencyMappings = [
            //    ['.', 'segment']
                'typeSpecLink'
            ]
          , Constructor = UIDocumentSegment
          , args = [this._zones, this._originTypeSpecPath]
          , childWidgetBus = this._childrenWidgetBus
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class UIDocument extends _BaseContainerComponent {
    constructor(widgetBus, _zones, originTypeSpecPath, baseClass='typeroof-document') {
        const documentContainer = widgetBus.domTool.createElement('article', {'class': baseClass})
          , zones = new Map([..._zones
                , ['document', documentContainer]
            ])
          ;
        widgetBus.insertElement(documentContainer);
        super(widgetBus, zones);
        const widgets = [
            [
                {   zone: 'document'
                  , rootPath: Path.fromParts('.', 'document')
                }
              , [
                    ['segments', 'collection']
                ]
              , UIDocumentSegments
              , this._zones
              , originTypeSpecPath
            ]
        ];
        this._initWidgets(widgets);
    }
}

class TypeSpecRampController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        // BUT: we may need a mechanism to handle typeSpec inheritance!
        // widgetBus.wrapper.setProtocolHandlerImplementation(
        //    ...SimpleProtocolHandler.create('animationProperties@'));
        const typeSpecManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'type_spec-manager'})
          , propertiesManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'properties-manager'})
          , stylePatchesManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'style_patches-manager'})
          , zones = new Map([..._zones
                , ['type_spec-manager', typeSpecManagerContainer]
                , ['properties-manager', propertiesManagerContainer]
                , ['style_patches-manager', stylePatchesManagerContainer]
                ])
          , typeSpecRelativePath = Path.fromParts('.','typeSpec')
          , originTypeSpecPath = widgetBus.rootPath.append(...typeSpecRelativePath);
          ;
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('typeSpecProperties@'));
        // widgetBus.insertElement(stageManagerContainer);
        super(widgetBus, zones);

        collapsibleMixin(typeSpecManagerContainer, 'legend');
        collapsibleMixin(propertiesManagerContainer, 'legend');
        collapsibleMixin(stylePatchesManagerContainer, 'legend');


        const widgets = [
            [
                {
                    rootPath: typeSpecRelativePath
                }
              , [['.', 'typeSpec']]
              , TypeSpecMeta
              , zones
              , initTypeSpecnion
              , isInheritingPropertyFn
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , stylePatchesManagerContainer
            ]
          , [
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
                {
                    zone: 'type_spec-manager'
                }
              , []
              , SelectAndDragByOptions
              , 'Create'
              , ''//'drag and drop into Rap-Editor.'
              , [ // options [type, label, value]
                    [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE, 'Type Spec', 'TypeSpec']
                ]
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
              , [
                    ['typeSpec/children', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Delete'
              , ''//'drag and drop into trash-bin.'
              , [
                    DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH
                ]
            ]
          , [
                {zone: 'properties-manager'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'TypeSpec Properties'
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
          , [
                {zone: 'style_patches-manager'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Style Patches'
            ]
          , [
                {   zone: 'style_patches-manager'
                  , relativeRootPath: Path.fromParts('.', 'stylePatchesSource')
                }
              , [
                    ['.', 'childrenOrderedMap']
                ]
              , UIStylePatchesMap // search for e.g. UIAxesMathLocation in videoproof-array-v2.mjs
              , this._zones
              , [] // eventHandlers
              , null // label 'Style Patches'
              , true // dragAndDrop
            ]
          , [
                {
                    zone: 'style_patches-manager'
                }
              , [
                    ['typeSpec/children', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Delete'
              , ''//'drag and drop into trash-bin.'
              , [
                    DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH
                ]
            ]
          , [
                {zone: 'layout'}
              , ['document']
              , UIDocument
              , this._zones
              , originTypeSpecPath
            ]
        ];
        this._initWidgets(widgets);
    }
    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('typeSpecProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('typeSpecProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export {
    TypeSpecRampModel as Model
  , TypeSpecRampController as Controller
};
