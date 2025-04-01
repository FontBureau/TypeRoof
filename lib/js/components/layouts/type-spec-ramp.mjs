/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    identity
  , zip
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
  , _UIBaseList
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
  , _AbstractSimpleOrEmptyModel
  , StringModel
  , CoherenceFunction
  , StaticDependency
  , ForeignKey
  , topologicalSortKahn
  , FreezableMap
  , getFieldsByType
} from '../../metamodel.mjs';

import {
    createDynamicModel
  , AvailableTypesModel
  , createGenericAvailableTypes
} from '../dynamic-types-pattern.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    StylePatchesMapModel
  , StylePatchModel
  , TypeSpecModel
  , availableStylePatchTypes
  , availableStylePatchesShortLabel
  , getStylePatchFullLabel
  , createStylePatch
  , validateStyleName
  , LeadingAlgorithmModel
  , runion_01_lineHeight
  , deserializeLeadingAlgorithmModel
} from '../type-spec-fundamentals.mjs';

import {
    ColorModel
  , getColorModelFields
  , colorPropertyGen
  , getColorFromPropertyValuesMap
  , culoriToColor
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
    genericTypeToUIElement
  , UITypeDrivenContainer
} from '../type-driven-ui.mjs'

import {
    getRegisteredPropertySetup
  , isInheritingPropertyFn
} from '../registered-properties.mjs';

import {
    COLOR
  , GENERIC
  , SPECIFIC
  , LEADING
  , childrenPropertiesBroomWagonGen
  , ProcessedPropertiesSystemMap
} from '../registered-properties-definitions.mjs';

import {
    StringOrEmptyModel
} from '../actors/models.mjs';

import {
    getPropertyValue
  , actorApplyCSSColors
  , actorApplyCssProperties
  //, DYNAMIC_MARKER
  //, cssPositioningHorizontalPropertyExpander
  , setTypographicPropertiesToSample
} from '../actors/properties-util.mjs';

import {
    FontSelect
} from '../font-loading.mjs';

const {
        DocumentNodeModel
      , createDocumentNode
      // , deserializeDocumentNodeModel
    } = createDynamicModel('DocumentNode')
  , DocumentNodes = _AbstractListModel.createClass('DocumentNodesModel', DocumentNodeModel)
    // actual data modelling:
  , StyleLinkOrEmptyModel = StringOrEmptyModel
  , TypeSpecLinkModel = StringModel
  , TextRunModel = _AbstractStructModel.createClass(
        'TextRunModel'
      , ['stylePatchLinkOrEmpty', StyleLinkOrEmptyModel] // Empty for default Style.
      , ['text', StringModel]
    )
  , DocumentElementModel = _AbstractStructModel.createClass(
        'DocumentElementModel'
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
        // This are childNodes like in DOM-Node/Element
        // allowing for other DocumentElementModel or TextRunModel
        // This means mean a DocumentElementModel is analogue to a
        // DOM-Element.
        // Consecutive TextRuns with the same 'styleLinkOrEmpty' should be joined
        // and there should be no difference in their appearance. As well, empty
        // TextRuns should get removed. See:
        //      The normalize() method of the Node interface puts the
        //      specified node and all of its sub-tree into a normalized
        //      form. In a normalized sub-tree, no text nodes in the
        //      sub-tree are empty and there are no adjacent text nodes.
        // We have a difference though to the DOM Node.normalize method,
        // different StyleLinks will prevent Nodes from getting merged.
        // I'm also not sure where to run normalize, but a CoherenceFunction
        // seems to be the ideal place so far.
      , ['nodes', DocumentNodes]
    )
  , [availableDocumentNodeTypes/*, DOCUMENT_NODE_TYPE_TO_DOCUMENT_NODE_TYPE_KEY */] = createGenericAvailableTypes([
        ['TextRun', 'Text-Run', TextRunModel]
      , ['Element', 'Element', DocumentElementModel]
    ])
  , DocumentModel = _AbstractStructModel.createClass(
        'DocumentModel'
      , ['nodes', DocumentNodes]
        // This enables a DocumentNode to contain other DocumentNodes without
        // circular dependency issues, as the list of availableDocumentNodeTypes
        // is created and injected after DocumentElementModel, which requires
        // it for it's own DocumentNodes.
      , ... StaticDependency.createWithInternalizedDependency(
                'availableDocumentNodeTypes'
              , AvailableTypesModel
              , availableDocumentNodeTypes
        )
         // only to bootstrap, until we can deserialize a ready made document.
      , CoherenceFunction.create(
            ['nodes']
          , function initNodes({nodes}) {
                const nodesData =  [
                    ['H1', 'Heading One']
                  , ['H2', 'Heading Two']
                  , ['H3', 'Heading Three']
                  , ['T1', 'Intro text leads reader into the article by the nose, with grace and dignity and a little pithy charm. Typeface has changed to the appropriate optical size by the miracle of modern typography.']
                  , ['T2', 'Johannes Gutenberg’s work on the printing press began in approximately 1436 when he partnered with Andreas Heilmann, owner of a paper mill. Having previously worked as a goldsmith, Gutenberg made skillful use of the knowledge of metals he had learned as a craftsman. He was the first to make type from an alloy of lead, tin, and antimony, which was critical for producing durable type that produced high-quality printed books and proved to be much better suited for printing than all other known materials.']
                  , ['T2', 'Επειδη δε κοινη το των Αρκαδων εθνος εχει τινα παρα πασι τοις Ελλησιν επ αρετη φημην, ου μονον δια ρην εν τοις ηθεσι και βιοις φιλοξενιαν και φιλανθρωπιαν, μαλιστα δε δια την εις το θειον ευσεβειαν, αξιον βραχυ διαπορησαι περι της Κυναιθεων αγριοτητος, πως οντες ομολογουμενως Αρκαδες τοσουτο κατ εκεινους τοθς καιπους διηνεγκαν των αλλων Ελληνων ωμοτητι και παρανομια. δοκαυσι δε μοι, διοτι τα καλως υπο των αρχαιων επινενοημενα και φυσικως συντεθεωρημενα περι παντας τους κατοικουντας την Αρκαδιαν, ταυτα δη πρωτοι και μονοι Αρκαδων εγκατελιπον. μουσικην γαρ, την γ αληθως μουσικην, πασι μεν ανθρωποις οφελος ασκειν Αρκασι δε και αναγκαιον. ου γαρ ηγητεον μουσικην, ως Εφορος φησιν εν τω προοιμιω της ολης προγματειας, ουδαμως αρμοζοντα λογον αυτω πιψας, επ απατη και γοητεια παραισηχθαι τοις ανθρωποις, ουδε τους παλαιοθς Κρητων και Λακεδαιμονιων αυλον και ρυθμον εις τον πολεμον αντι σαλπιγγος εικη νομιστεον εισαγαγειν, ουδε τους πρωτους Αρκαδων εις την ολην πολιτειαν την μοθσικην παραλαβειν επι τοσουτον ωστε μη μονον παισιν ουσιν, αλλα ακι νεανισκοις γενομενοις εως τριακοντ ετων κατ αναγκην ουντροφον ποιειν αυτην, ταλλα τοις βιοις οντας αυστηροτατους.']
                  , ['T2', 'В глубоких и темных водах Антарктики ученые обнаружили невероятное изобилие до сих пор неизвестных видов морской жизни. Исследователи открыли более 700 новых видов морских существ в морях, которые раньше считались слишком неблагоприятными для существования большого биологического разнообразия. Эти темные воды буквально кишат стаями хищных губок, свободноплавающих червей, ракообразных и моллюсков. Доклад о новых видах фауны был опубликован в журнале Nature. “То, что раньше считалось пустой бездной, на поверку оказалось динамичной, меняющейся и биологически богатой средой”, - сказала одна из соавторов документа, морской биолог Британского общества исследования Антарктики доктор Кэтрин Линс. “Находка этой сокровищницы морской живности - наш первый шаг на пути к пониманию сложного взаимоотношения глубоких океанов и распределения морской жизни”, - добавила она. Науке это пока неизвестно. Исследование антарктических вод было проведено в рамках проекта Andeep, изучающего биологическое разнообразие глубоководного антарктического дна. Один из ранее неизвестных ракообразных (Cylindrarcturus), найденных в Антарктитке Исследователи не ожидали обнаружить такого разнобразия морской жизни Проект призван заполнить “вакуум знаний” о фауне, населяющей самые глубокие воды Южного океана.']
                  , ['T2', '我的征途是星辰大海 "My Conquest is the Sea of Stars", a famous sentence in Legend Of The Galactic Heroes']
                  , ['T2', '很久很久以前，在一个遥远的星系 "A long time ago in a galaxy far, far away", a famous sentence in Star Wars']
                ];
                console.log(`${this} (initNodes) nodes: ${nodes}`, nodes.size);
                if(nodes.size === 0) {
                    for(const [/*type*/, text] of nodesData) {
                        const elementNode = createDocumentNode('Element', nodes.dependencies)
                          , textRunNode = createDocumentNode('TextRun', nodes.dependencies)
                          ;
                        textRunNode.get('instance')/* .wrapped */.get('text').value = text;
                        elementNode.get('instance')/* .wrapped */.get('nodes').push(textRunNode);
                        nodes.push(elementNode);
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
      , ['editingStylePatch', PathModelOrEmpty]
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


// FIXME: put this rather into the UITypeDrivenContainer
// so we can make a complete mapping if all values that require it and
// then filter where the filter is required!
const _excludesTypeSpecPPSMap = new Set([
                      'children' // => Controlled globally by TreeEditor
                    , 'label' // => This has a control for label.
                    , 'autoOPSZ' // => UIManualAxesLocations has a control for autoOPSZ.
                    ])
  , TYPESPEC_PPS_MAP = Object.freeze(new ProcessedPropertiesSystemMap(
        Array.from(TypeSpecModel.fields.entries())
        .map(item=>{
            const [modelFieldName, modelFieldType] = item;
            // console.log(`modelFieldName ${modelFieldName} modelFieldType: ${modelFieldType.name}`)
            let prefix = GENERIC;
            if(_excludesTypeSpecPPSMap.has(modelFieldName))
                prefix = null;
            else if(modelFieldType === ColorModel)
                prefix = COLOR;
            else if (modelFieldType === LeadingAlgorithmModel) {
                prefix = LEADING;
            }
            else if(modelFieldName === 'axesLocations')
                // we should use a symbol here!
                prefix = 'axesLocations/';
            else if(modelFieldName === 'stylePatches')
                prefix = 'stylePatches/';
            const entry = [
                    modelFieldName
                  , (prefix === null)
                            ? null // don't make a UI for this
                            :ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName)
            ];
            // console.log('entry:', entry);
            return entry;
        })
        .filter(([/*k*/, item])=>!!item)
    ))
  ;

// This is partially responsible to organize the inherited values as
// is is responsible to organize the default/fallback values.
// In both cases the current layer/modelInstance doesn't define the
// property itself. The difference is that  with inheritance, the
// value is defined in a parent and with defaults there's no user
// made value definition, but we still need to have some value.
//
// The plan is to create a bottom most model instance that is
// prepared with all the default values, so that there's no case
// without inheritance ever. It must be noted, that some values
// do not inherit, it's a configurable behavior and it would fail
// in that case!
//
// I have a hard time to figure out the best approach to inject
// default values. The case of non-inherited properties is a real
// use case, which makes it more complicated. It applies to x/y values
// that if applied to the layer/container must not be applied to the
// children directly, as the container already has moved by the amount.
// The EM would be a good example as well, as for a child it should always
// reset to 1, otherwise the font-size would get bigger/smaller for each
// added child element. Depending on the exact kind of elements,
// background-color is also a value that doesn't inherit well.
//
// This means we need a specific approach to default values in any
// case and can't rely on the inheritance mechanism, in the cases where
// inhertiance is turned off.

const _NOTDEF = Symbol('_NOTDEF');

function typeSpecGetDefaults(getLiveProperties, ppsRecord, fieldName, /*BaseModelType.*/modelDefaultValue=_NOTDEF) {
    const {fullKey} = ppsRecord
        // If defaultVal === _NOTDEF and fullKey is not found
        // this will raise.
      , getFallback = ()=>{
            const fallback = getRegisteredPropertySetup(fullKey, modelDefaultValue === _NOTDEF
                                ? getRegisteredPropertySetup.NOTDEF
                                : modelDefaultValue);
            return fallback === modelDefaultValue
                ? modelDefaultValue
                : fallback.default
            ;
        }
        // When this is the root typeSpec we get a KEY ERROR:
        //    via VideoproofController constructor initial resources:
        //    Error: KEY ERROR not found identifier "typeSpecProperties@"
        //    in [ProtocolHandler typeSpecProperties@]:
        //    typeSpecProperties@/activeState/typeSpec.
        // FIXME: We should rather get the own typeSpecProperties@ and then
        // see if it defines itself a parent. Better then hard-coding the
        // parent path in here.

          // null or the liveProperties instance
        , liveProperties = getLiveProperties()
        , propertyValues = liveProperties !== null
                ? liveProperties.typeSpecnion.getProperties()
                : new Map()
        ;
    // console.log(`typeSpecGetDefaults ${ppsRecord} fieldName: ${fieldName} modelDefaultValue`, modelDefaultValue
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
        return getFallback();
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
            throw new Error(`KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`);
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
            throw new Error(`KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`);
        return result;
    }
    else {
        if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        return getFallback();
    }
    if(modelDefaultValue !== _NOTDEF)
        return modelDefaultValue;
    throw new Error(`KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`);
}


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

    _createTypeSpecWrappers(typeSpecPath, rootTypeSpecPath) {
        const TypeClass =  this.widgetBus.getEntry(typeSpecPath).constructor;
        if(TypeClass !== TypeSpecModel)
            // NOTE: The uses of TYPESPEC_PPS_MAP kind of binds this to
            // that Type. But this check is not strictly required, it's
            // a sanity check to confirm an assumption that was prevailing
            // when this code was written.
            throw new Error(`TYPE ERROR expected TypeSpecModel at path ${typeSpecPath} but instead got ${TypeClass.name}.`);

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
        //
        // So far it looks right to reference the current typeSpecProperties
        // not the parent. this is used in getLiveProperties via typeSpecGetDefaults
        // and it seems accurate to read the value on this level and not
        // on the parent level.
        const typeSpecPropertiesKey = `typeSpecProperties@${typeSpecPath}`//.append('..', '..')}`
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
          , getLiveProperties = ()=>{
                // NOTE: I don't think this case happens anymore, as
                // typeSpecPropertiesKey no longer tries to reference
                // the parent.
                return typeSpecPropertiesKey === 'typeSpecProperties@'
                    ? null
                    : this.getEntry(typeSpecPropertiesKey)
                    ;
            }
          , getDefaults = typeSpecGetDefaults.bind(null, getLiveProperties)
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
                {   rootPath: typeSpecPath
                  , zone: 'main'
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
                  , genericTypeToUIElement
                  , requireUpdateDefaults
                }
                // FIXME: the type of the root element should be fixed
                // to TypeSpec as well!
              , TYPESPEC_PPS_MAP
              // , 'Hello UITypeDrivenContainer'// label
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
           , rootPath = Path.fromString(this.widgetBus.getExternalName('rootTypeSpec'))
           , path = pathOrEmpty.isEmpty
                ? rootPath
                : rootPath.append('children', ...pathOrEmpty.value)
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
            widgetWrappers.push(...this._createTypeSpecWrappers(path, rootPath));
        }

        this._widgets.push(...widgetWrappers);
        for(const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}

class UICompositeStylePatchItem extends _UIBaseList.UIItem {
    static ROOT_CLASS = `ui-style_patch-composite-item`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH;

    // no need to mention 'value'
    static additionalDependencies = ['sourceMap'];
    update(changedMap) {
        const sourceMap = changedMap.has('sourceMap')
                ? changedMap.get('sourceMap')
                : this.getEntry('sourceMap')
          , value = changedMap.has('value')
                ? changedMap.get('value')
                : this.getEntry('value')
          , key = value.value
          , item = sourceMap.has(key)
                ? sourceMap.get(key)
                : null
          ;
        let label;
        if(item !== null) {
            const typeKey = item.get('stylePatchTypeKey').value
            label = getStylePatchFullLabel(typeKey)
        }
        else
            label = '[NULL]';
        this._output.textContent = `${key} – ${label}`;
    }
}

/**
 * List of AxisLocationValue components.
 */
class UICompositeStylePatch extends _UIBaseList {
    static ROOT_CLASS = `ui-style_patch-composite`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UICompositeStylePatchItem; // extends _UIBaseList.UIItem
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH;
    // creates a link when dragged from UIStylePatchesMap
    static ITEM_DATA_TRANSFER_TYPE_CREATE = DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH;

    _createNewItem(targetPath, insertPosition, items, value) {
        const newItem = items.constructor.Model.createPrimalDraft(items.dependencies)
          , path = Path.fromString(value)
          ;
        // value is an absolute path, but we are only interested in the
        // key of the style in the stylePatchesSource Map.
        newItem.value = path.parts.at(-1);
        return newItem;
    }
}

/*
 * TODO: this is a very simple nice concept:
 * taking an dynamic type and building specific interfaces
 * for the specific type. This could also be done
 * in a parent, but like this it feels like it makes a clear
 * concept.
 * UIDocumentNode does the same, so the basics of these
 * two implemations should become class in basics.
 * _provisionWidgets/constructor and probably a
 * NOT IMPLEMENTED raising version of _createWrapperForType
 * Though, mapping of concrete type to it's interface(s) may also
 * become a configuration thing eventually.
 * Can this case be handled with type-driven-ui? It should probably.
 *
 * NOTE: UIAxesMathLocationsSumItem also implements this concept,
 * hence, maybe it could be a mixin-approach as UIAxesMathLocationsSumItem
 * already extends _UIBaseListContainerItem.
 */
class UIStylePatch extends _BaseContainerComponent {
    constructor(widgetBus, zones/*, originTypeSpecPath*/) {
        super(widgetBus, zones);
        // this._originTypeSpecPath = originTypeSpecPath;
        this._currentTypeKey = null;
    }

    _createWrappersForType(typeKey) {
        const widgets = []
          , settings = {
               // document/nodes/{key}
               rootPath: this.widgetBus.rootPath.append('instance')
             , zone: 'local'
            };
        let Constructor
          , dependencyMappings
          , args
          ;
        if(typeKey === 'SimpleStylePatch') {
            // need a handling for the font selection!
            widgets.push([
                {...settings}
              , [
                    ['/availableFonts', 'options']
                  , 'activeFontKey'
                ]
              , FontSelect
              , true
            ]);

            dependencyMappings = [];
            Constructor = UITypeDrivenContainer;

            const getLiveProperties = ()=>{
                return null;
                // NOTE: I don't think this case happens anymore, as
                // typeSpecPropertiesKey no longer tries to reference
                // the parent.
            //    return typeSpecPropertiesKey === 'typeSpecProperties@'
            //        ? null
            //        : this.getEntry(typeSpecPropertiesKey)
            //        ;
            }
            , getDefaults = typeSpecGetDefaults.bind(null, getLiveProperties)
            ;

            // AxesLocationsModel seems to require 'typeSpecProperties@'
            // which causes:
            //      Uncaught (in promise) Error: KEY ERROR not found identifier
            //      "typeSpecProperties@/activeState/stylePatchesSource/bold/instance"
            //      in [ProtocolHandler typeSpecProperties@]:
            //      typeSpecProperties@/activeState/typeSpec.
            //
            // We could filter the TYPESPEC_PPS_MAP and try to avoid
            // the error by not using AxesLocationsModel.
            console.log(`${this} TYPESPEC_PPS_MAP`, TYPESPEC_PPS_MAP);


            console.log(`${this} ... ${this.widgetBus.rootPath.append('instance')}`,
                     this.widgetBus.getEntry(this.widgetBus.rootPath.append('instance')));
            // keys are:
            //    "baseFontSize", "relativeFontSize", "textColor",
            //    "backgroundColor", "autoOPSZ", "axesLocations",
            //    "activeFontKey", "font", "installedFonts"


            const removeItems = new Set([
                    // 'baseFontSize' // Maybe only use in paragraph context
                ])
              , PPS_MAP = new ProcessedPropertiesSystemMap(
                    Array.from(TYPESPEC_PPS_MAP.entries())
                        .filter(([key])=>!removeItems.has(key))
                )
              ;
            // keys is this are:
            //    "columnWidth", "leading", "baseFontSize", "relativeFontSize",
            //     "textColor", "backgroundColor", "stylePatches"
            // minus: "axesLocations" of course
            //
            // The main diff to the model are:
            //      "columnWidth", "leading"
            // The following are expected to be missing as well:
            //      "activeFontKey", "font", "installedFonts"

            console.log(`${this} PPS_MAP`, PPS_MAP);

            args = [
                this._zones
              , {
                    getDefaults
                    // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
                    //          via VideoproofController constructor initial resources: Error:
                    //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
                    //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
                    // Maybe this key is flawed in this context?
                  , updateDefaultsDependencies: []//updateDefaultsDependencies
                  , genericTypeToUIElement
                  , requireUpdateDefaults: ()=>true //
                }
                // FIXME: the type of the root element should be fixed
                // to TypeSpec as well! (what does this mean?)
              , PPS_MAP
              //, 'Hello UITypeDrivenContainer'// label
            ]
        }
        else if(typeKey === 'CompositeStylePatch') {
            dependencyMappings = [
                ['./styles', 'collection']
              , [this.widgetBus.getExternalName('sourceMap'), 'sourceMap']
            ];
            Constructor = UICompositeStylePatch;
            args = [this._zones]
        }
        else
            throw new Error(`KEY ERROR unknown typeKey ${typeKey}.`);

        widgets.push([settings, dependencyMappings, Constructor, ...args]);
        return widgets.map(widget=>this._initWrapper(this._childrenWidgetBus, ...widget));
    }

    _provisionWidgets(/* compareResult */) {
        const node = this.getEntry('.')
          , typeKey = node.get('stylePatchTypeKey').value
          ;
        if(this._currentTypeKey === typeKey)
            return new Set();
        this._currentTypeKey = typeKey;
        const newWrappers = this._createWrappersForType(typeKey)
          , deleted = this._widgets.splice(0, Infinity, ...newWrappers)
          ;
        for(const wrapper of deleted)
            wrapper.destroy();
        return super._provisionWidgets();
    }
}

/**
 * FIXME: this is also kind of a repeated pattern TypeSpecPropertiesManager looks similar.
 */
class StylePatchPropertiesManager extends _CommonContainerComponent {
    // jshint ignore:start
    /**
     * could be as well:
     * initialUpdate(...args){
     *     return _BaseDynamicCollectionContainerComponent.prototype.initialUpdate.call(this, ...args);
     * }
     */
    initialUpdate = _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    // jshint ignore:end
    constructor(widgetBus, _zones) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_style-patch-properties-manager'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        widgetBus.insertElement(localZoneElement);
        // provision widgets dynamically!
        super(widgetBus, zones);
        this._currentTypeKey = null;
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName('stylePatchPath'));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName('stylePatchPath'));
        return dependencies;
    }

    _createStylePatchWrappers(stylePatchPath, item) {
        const TypeClass = item.constructor;
        if(TypeClass !== StylePatchModel)
            // NOTE: This check is not strictly required, it's
            // a sanity check to confirm.
            throw new Error(`TYPE ERROR expected StylePatchModel at path ${stylePatchPath} but instead got ${TypeClass.name}.`);

        const typeKey = item.get('stylePatchTypeKey').value
          , label = getStylePatchFullLabel(typeKey)
          , widgets = [
            [
                {
                    zone: 'local'
                }
              , []
              , StaticTag
              , 'h3'
              , {}
              , `Style: ${stylePatchPath.parts.at(-1)} – ${label}`
            ]
          , [
                {
                    rootPath: stylePatchPath
                  , zone: 'local'
                }
              , [
                    [this.widgetBus.rootPath.toString(), 'sourceMap']
                ]
              , UIStylePatch
              , this._zones
              , stylePatchPath
            ]
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenWidgetBus, ...widgetArgs));
    }

    _createEmptyWrappers() {
        const widgets = [
            [   {zone: 'local'}
              , []
              , StaticTag
              , 'span'
              , {}
              , '(Select a Style)'
            ]
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenWidgetBus, ...widgetArgs));
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult)
           , pathOrEmpty = changedMap.has('stylePatchPath')
                ? changedMap.get('stylePatchPath')
                : this.getEntry('stylePatchPath')
           , rootPath = Path.fromString(this.widgetBus.getExternalName('childrenOrderedMap'))
           , path = !pathOrEmpty.isEmpty
                ? rootPath.append(...pathOrEmpty.value)
                : null
            , childrenMap = changedMap.has('childrenOrderedMap')
                        ? changedMap.get('childrenOrderedMap')
                        : this.getEntry('childrenOrderedMap')
            , item = !pathOrEmpty.isEmpty
                  // If path can't be resolved item becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                ? getEntry(childrenMap, pathOrEmpty.value, null)
                : null
           , typeKey = item === null ? null : item.get('stylePatchTypeKey').value
           , typeChanged = this._currentTypeKey !== typeKey
           , rebuild = changedMap.has('stylePatchPath') || typeChanged
           ;
        this._currentTypeKey = typeKey;
        if(rebuild) {
            // deprovision widgets
            for(const widgetWrapper of this._widgets)
                widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set()
          , widgetWrappers = []
          ;

        if(rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            if(item !== null) {
                widgetWrappers.push(...this._createStylePatchWrappers(path, item));
            }
            else {
                widgetWrappers.push(...this._createEmptyWrappers());
            }
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


class StylePatcheButton extends DynamicTag {
    constructor(widgetBus, tag, attr, eventListeners,...restArgs){
        super(widgetBus, tag, attr, ...restArgs);
        for(const eventListener of eventListeners)
            this.element.addEventListener(...eventListener);
    }

    _setActive(pathEntry) {
        let shouldBeActive = false;
        if(!pathEntry.isEmpty) {
            const myKey = this.widgetBus.rootPath.parts.at(-2) // .../{key}/instance
              , path = pathEntry.value
              , selectedKey = path.parts.at(-1) // ./key
              ;
            shouldBeActive = myKey === selectedKey;
        }
        this.element.classList[shouldBeActive ? 'add' : 'remove']('active');
    }

    update(changedMap) {
        super.update(changedMap);
        if(changedMap.has('stylePatchPath')) {
            const pathEntry = changedMap.get('stylePatchPath');
            this._setActive(pathEntry);
        }

        if(changedMap.has('data'))
            this.element.textContent = this._formatter(changedMap.get('data').value);
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
        const items = Array.from(availableStylePatchTypes.keys()).map(typeKey=>{
                return [typeKey, getStylePatchFullLabel(typeKey)]
            })
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
          , dependencyMappings = [
                    ['../stylePatchTypeKey', 'data']
                  , [this.widgetBus.getExternalName('stylePatchPath'), 'stylePatchPath']
                ]
             // Should be a really simple item maybe displaying the label
             // Maybe we could edit the label.
             // But rather it is just to select, on click and to display
             // as selected, e.g. bold label
          , Constructor = StylePatcheButton
          , args = [
                // Want this to be a Button.
                'button', {'class': 'ui_style_patches_map-item-value'}
              , [
                    ['click', (/*event*/)=>this._onClickHandler(key)]
                ]
              , function(typeKey) {
                    const typeLabel = availableStylePatchesShortLabel.has(typeKey)
                        ? availableStylePatchesShortLabel.get(typeKey)
                        : availableStylePatchTypes.get(typeKey).get('label').value
                        ;
                    return `${typeLabel} Edit`;
                }
            ]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }


    _onClickHandler(key) {
        this._changeState(()=>{
            const path = Path.fromParts('.', key)
              , selected = this.getEntry('stylePatchPath')
            ;
            // this is a toggle
            if(!selected.isEmpty && selected.value.equals(path))
                selected.clear();
            else
                selected.value = path;
        });
    }

    _createKeyValue(childrenOrderedMap) {
        const typeSelect = this.getWidgetById('key-create-type-select')
          , typeKey = typeSelect.value
          , value = createStylePatch(typeKey, childrenOrderedMap.dependencies);
          ;
        return value;
    }

    // If implemented called within a _changeState transaction,
    // with the new key as argument:
    // this._onItemCreated(key)
    _onItemCreated(key) {
        const path = Path.fromParts('.', key)
          , selected = this.getEntry('stylePatchPath')
          ;
        // Only set if nothing is selected. a StylePatch is being
        // selected, it could be distracting to switch to the new
        // one, but if none is selected, it's probably the next step
        // to edit the newly created StylePatc;
        if(selected.isEmpty)
            selected.value = path;
    }
}

/**
 * Note: this kind of replaces DependentValue of Animanion as
 * it can also be used to define aliases, e.g:
 *  yield [`axesLocations/opsz`,  new SyntethicValue(identity, [`${GENERIC}fontSize`]];
 *  and from the look of it that's what DependentValue in Animanion
 * basically did. It can also do more,  e.g. represent a calculation
 * of pre-existing values. And we do the full dependency graph resolution
 * in here, it seems, after all simple to comprehend.
 */
class SyntethicValue {
    constructor(fn, dependencies) {
        if(!dependencies.length)
            throw new Error(`VALUE ERROR dependencies can't be empty.`);
        Object.defineProperties(this, {
            fn: {value: fn}
          , dependencies: {value: Object.freeze(Array.from(dependencies))}
        });
    }
    toString() {
        return `[SyntethicValue ${this.dependencies.join(', ')}]`;
    }
    call(...args) {
        return this.fn(...args);
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
        // Must call initPropertyValuesMap to set _propertyValuesMap.
        this._propertiesValuesMap = null;
    }

    *_propertiesGenerator(typeSpec, parentPropertyValuesMap) {
        const hasParentProtperty = parentPropertyValuesMap.has.bind(parentPropertyValuesMap)
         , getParentProperty = parentPropertyValuesMap.get.bind(parentPropertyValuesMap)
         ;
        for(const gen of this._propertiesGenerators.values()) {
            yield *  gen(
                    // outerTypespecnionAPI
                    {hasParentProtperty, getParentProperty}
                  , typeSpec
            );
        }
    }

    _resolveSyntheticProperties(rawPropertyMap, parentPropertyValuesMap, syntheticProperties) {
        if(!syntheticProperties.size)
            return rawPropertyMap;

        const dependantsMap = new Map()
          , requirementsMap = new Map()
          , noDepsSet = new Set(parentPropertyValuesMap.keys())
          ;
        for(const propertyName of rawPropertyMap.keys()) {
            if(!syntheticProperties.has(propertyName)) {
                noDepsSet.add(propertyName);
                continue
            }
            // It's a SyntheticProperty
            const synthProp = rawPropertyMap.get(propertyName);
            if(synthProp.dependencies.length === 0) {
                // NOTE We currently don't allow this configuration for
                // SyntheticProperties, but it's rather a semantic reason:
                // if there's no dependency, a value could be produced immediately.
                // Also, if the SyntheticProperty doesn't have local dependencies,
                // it resolves to NULL/not defined; this could change as well
                // but that would require a case and extra configuration.
                noDepsSet.add(propertyName);
                continue;
            }
            dependantsMap.set(propertyName, new Set(synthProp.dependencies));
            for(const dependency of synthProp.dependencies) {
                // _mapGetOrInit(requirementsMap, dependeny, ()=>[]).push(propertyName);
                if(!requirementsMap.has(dependency))
                    requirementsMap.set(dependency, []);
                requirementsMap.get(dependency).push(propertyName);
            }
        }
        const resolveOrder = topologicalSortKahn(noDepsSet, requirementsMap, dependantsMap);
        for(const propertyName of resolveOrder) {
            if(!syntheticProperties.has(propertyName))
                // all properties will end up in resolveOrder
                continue;
            const synthProp = rawPropertyMap.get(propertyName)
              , args = []
              ;
            let localDependencies = 0;
            for(const dependencyName of synthProp.dependencies) {
                if(rawPropertyMap.has(dependencyName)) {
                    localDependencies += 1;
                    // assert: !(rawPropertyMap.get(dependencyName) instanceof SyntheticProperty)
                    args.push(rawPropertyMap.get(dependencyName));
                }
                else if(parentPropertyValuesMap.has(dependencyName)) {
                    args.push(parentPropertyValuesMap.get(dependencyName));
                }
                else {
                    // else: this is going to be dropped because propertyName
                    // (no longer) can be resolved. I won't log a message
                    // as this is expected behavior.
                    break;
                }
            }
            if(localDependencies === 0 || arguments.length !== synthProp.dependencies.length)
                rawPropertyMap.delete(propertyName);
            const value = synthProp.call(...args);
            rawPropertyMap.set(propertyName, value);
        }
        return rawPropertyMap;
    }


    /* NOTE: before accessing getPropertyValuesMap init is required.
     * This will create a cache, that will be around until initPropertyValuesMap
     * if called again or until the instance ceases to exist.
     */
    initPropertyValuesMap(parentPropertyValuesMap) {
        const syntheticProperties = new Set()
            , rawPropertyMap = new Map()
            ;
        for(const [propertyName, propertyValue] of this._propertiesGenerator(this.typeSpec, parentPropertyValuesMap)) {
            if(propertyValue instanceof SyntethicValue)
                syntheticProperties.add(propertyName);
            else if(syntheticProperties.has(propertyName))
                // overrides previous defintion
                syntheticProperties.delete(propertyName);
            rawPropertyMap.set(propertyName, propertyValue);
        }
        this._propertyValuesMap = this._resolveSyntheticProperties(rawPropertyMap, parentPropertyValuesMap, syntheticProperties);
    }

    getPropertyValuesMap() {
        if(this._propertyValuesMap === null)
            throw new Error(`LIFECYCLE ERROR must call initPropertyValuesMap before propertyValuesMap can be read.`);
        return this._propertyValuesMap;
    }

    toString() {
        return `[${this.constructor.name}+${this._propertiesGenerators.map(pg=>pg.name).join('+')}]`;
    }

    getPropertyValue(propertyName, defaultVal=super._NOTDEF) {
        const propertyMap = this.getPropertyValuesMap();
        if(!propertyMap.has(propertyName)) {
            if(defaultVal !== this.constructor._NOTDEF)
                return defaultVal;
            throw new Error(`KEY ERROR propertyName "${propertyName}" not found in ${this}.getPropertyValue`);
        }

        return propertyMap.get(propertyName);
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

    constructor(localTypeSpecnion, typeSpecDefaultsMap, parentTypeSpecnion=null, isInheritingPropertyFn=null) {
        // must be a HierarchicalScopeTypeSpecnion as well/same interface
        // typeSpecnion.parentTypeSpecnion => typeSpecnion || null
        Object.defineProperty(this, 'parentTypeSpecnion', {value: parentTypeSpecnion});
        Object.defineProperty(this, 'localTypeSpecnion', {value: localTypeSpecnion});
        if(parentTypeSpecnion !== null && !isInheritingPropertyFn)
            throw new Error('ASSERTION FAILED parentTypeSpecnion is not null but isInheritingPropertyFn is not set.');
        this._isInheritingPropertyFn = isInheritingPropertyFn;
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
        this._propertyValuesMap = this._initPropertyValuesMap();
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

    _initPropertyValuesMap() {
        const parentPropertyValuesMap = this.parentTypeSpecnion === null
            // FIXME: this is not exact enough, we need to differentiate
            // whether to inherit or whether to take a value from the
            // defaults.
            ? this._typeSpecDefaultsMap // new Map()
            : this.parentTypeSpecnion.getProperties()
            // this creates a copy, so we don't change parentPropertyValuesMap.
          , propertyValuesMap  = new Map(
                Array.from(parentPropertyValuesMap)
                    .filter(([propertyName/*, value*/])=>this._isInheritingProperty(propertyName))
            )
          ;
        this.localTypeSpecnion.initPropertyValuesMap(parentPropertyValuesMap);
        for(const [propertyName, propertyValue] of this.localTypeSpecnion.getPropertyValuesMap()) {
            // All properties in localTypeSpecnion override properties
            // in parentPropertyValuesMap
            propertyValuesMap.set(propertyName, propertyValue);
        }
        return propertyValuesMap;
    }
    getProperties() {
        return this._propertyValuesMap;
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

function* colorsGen(outerTypespecnionAPI, hostInstance/* here a TypeSpecModel */) {
    for(const fieldName of getColorModelFields(hostInstance.constructor)) {
        const color = hostInstance.get(fieldName);
        yield* colorPropertyGen(fieldName, color);
    }
}


/**
 * It looks so far to be *very* nice to calculate line-heigth-em/autoLinearLeading
 * in the properties directly instead of later where the value is used.
 * This way, we can use the value for other synthetic properties and the
 * calculation is at a central point instead of per user.
 *
 * This has implications on how we'll propagate parametric typography
 * in the future.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
function* _pathSpecGen(getLeave, nextNode, parentPath, pathSpec, cursor=null) {
    if(!pathSpec.length) {
        if(!(cursor instanceof _AbstractSimpleOrEmptyModel && cursor.isEmpty))
            yield getLeave(parentPath, cursor);
        return;
    }
    const [head, ...tail] = pathSpec;
    for(const key of head) {
        const nextCursor = nextNode ? nextNode(cursor, key) : null
            , path = [...parentPath, key]
            ;
        yield* _pathSpecGen(getLeave, nextNode, path , tail, nextCursor);
    }
}

/**
 * This only yields (flattens) the full path described in a pathSpec
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
function *pathSpecPathsGen(pathSpec, prefix) {
    function getLeave(path/*, cursor*/) {
        return path;
    }
    for( const spec of pathSpec)
        yield * _pathSpecGen(getLeave, null, [prefix], spec);
}

/**
 *  This reads from a metamodel instance according to pathSpec.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
function* pathSpecValuesGen(pathSpec, prefix, data) {
    function nextNode(cursor, key) {
        return cursor.get(key);
    }
    function getLeave(path , cursor) {
        return [path.join('/'), cursor.value];
    }
    for(const spec of pathSpec)
        yield * _pathSpecGen(getLeave, nextNode, [prefix], spec, data);
}


// This will produce:
//  * {prefix to leading/} a/leading
//  * {prefix to leading/} a/lineWidth
//  * {prefix to leading/} b/leading
//  * {prefix to leading/} b/lineWidth
//  * {prefix to leading/} minLeading
//  * {prefix to leading/} maxLeading
const PATH_SPEC_AUTO_LINEAR_LEADING = [
    [['a', 'b'], ['leading', 'lineWidth']]
  , [['minLeading', 'maxLeading']]
];

/**
 * recursive helper function for _fillTree
 */
function _fillTreeGetNodeFromRegistry(registry, path) {
    const fullNodeKey = path.join('/');
    let node = registry.get(fullNodeKey);
    if(!node) {
        node = {};
        registry.set(fullNodeKey, node);
        const key = path.at(-1)
          , parent = _fillTreeGetNodeFromRegistry(registry, path.slice(0, -1))
          ;
        parent[key] = node;
    }
    return node;
}

/**
 * Put a flat list of paths into a nested object, setting the leaves
 * to values from valuesMap.
 */
function _fillTree(prefix, paths, valuesMap) {
    const registry = new Map([[prefix, {}]]);
    for(const path of paths) {
        const fullKey = path.join('/')
            , lastKey = path.at(-1)
            ;
        const parent = _fillTreeGetNodeFromRegistry(registry, path.slice(0, -1));
        parent[lastKey] = valuesMap.get(fullKey)
    }
    return registry.get(prefix);
}

function AutoLinearLeadingSyntethicValue(prefix) {
    const COLUMN_WIDTH_EN = `${GENERIC}columnWidth`
      , RELATIVE_FONT_SIZE = `${GENERIC}relativeFontSize`
      , argsNames = [COLUMN_WIDTH_EN, RELATIVE_FONT_SIZE]
      , paths = []
      ;
    for(const path of pathSpecPathsGen(PATH_SPEC_AUTO_LINEAR_LEADING, prefix)) {
        const fullKey = path.join('/');
        argsNames.push(fullKey);
        paths.push(path);
    }

    function calculate(...args) {
        const valuesMap = new Map(zip(argsNames, args))
            // NOTE: look at PATH_SPEC_AUTO_LINEAR_LEADING to see how this works
          , {a, b, minLeading, maxLeading } = _fillTree(prefix, paths, valuesMap)
          , columnWidthEn = valuesMap.get(COLUMN_WIDTH_EN)
          , relativeFontSize = valuesMap.get(RELATIVE_FONT_SIZE)
          , actualColumnWidth = columnWidthEn/relativeFontSize
          ;
        return runion_01_lineHeight(a, b, actualColumnWidth, minLeading, maxLeading);
    }
    return new SyntethicValue(calculate, argsNames);
}

function* leadingGen(outerTypespecnionAPI, hostInstance) {
    for(const fieldName of getFieldsByType(hostInstance.constructor, LeadingAlgorithmModel)) {
       const PREFIX = `${LEADING}${fieldName}`
          , ALGORITHM_TYPE = `${PREFIX}/algorithm`
          , LEADING_HEIGHT_EM = `${PREFIX}/line-height-em`
          , leadingAlgorithm = hostInstance.get(fieldName)
          , algorithm = leadingAlgorithm.get('leadingAlgorithmTypeKey').value
          ;
        if(algorithm === ForeignKey.NULL) {
            if(outerTypespecnionAPI.hasParentProtperty(ALGORITHM_TYPE)) {
                const algorithm = outerTypespecnionAPI.getParentProperty(ALGORITHM_TYPE)
                if(algorithm === 'AutoLinearLeading') {
                    // We always calculate this if the AutoLinearLeading
                    // is inherited, especially because `${GENERIC}columnWidth`
                    // could have changed in this layer.
                    yield [LEADING_HEIGHT_EM, new AutoLinearLeadingSyntethicValue(PREFIX)];
                }
            }
            continue;
        }
        const data = leadingAlgorithm.get('instance').wrapped;
        yield [ALGORITHM_TYPE, algorithm];
        if(algorithm === 'AutoLinearLeading') {
            yield* pathSpecValuesGen(PATH_SPEC_AUTO_LINEAR_LEADING, PREFIX, data);
            yield [LEADING_HEIGHT_EM, new AutoLinearLeadingSyntethicValue(PREFIX)];
        }
        else if(algorithm === 'ManualLeading')
            yield [`${PREFIX}/line-height-em`, data.get('leading').value];
        else
            throw new Error(`NOT IMPLEMENTED leadingGen don't know how to handle algorithm type "${algorithm}".`);
    }
}

function* fontGen(outerTypespecnionAPI, hostInstance/* here a TypeSpecModel */) {
    const font = hostInstance.get('font');
    if(font !== ForeignKey.NULL) {
        yield [`${SPECIFIC}font`, font.value];
    }
}

/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 *
 */
function* baseFontSizeGen(outerTypespecnionAPI, hostInstance) {
    const baseFontSize = hostInstance.get('baseFontSize')
      , relativeFontSize = hostInstance.get('relativeFontSize')
      ;
    if(!baseFontSize.isEmpty)
        yield [`${GENERIC}baseFontSize`, baseFontSize.value];
    if(!relativeFontSize.isEmpty)
        yield [`${GENERIC}relativeFontSize`, relativeFontSize.value];
}


/**
 * Now, this becomes to be a "syntetic" value, it is created from
 * two original values and then calculated. Also, there's no actual
 * model data for this anymore.
 */
function* fontSizeGen(outerTypespecnionAPI, hostInstance/* here a TypeSpecModel */) {
    const baseFontSize = hostInstance.get('baseFontSize')
      , relativeFontSize = hostInstance.get('relativeFontSize')
      ;
    if(baseFontSize.isEmpty && relativeFontSize.isEmpty)
        // font-size is defined by both of these values, if none is
        // defnied in here, the inherited value is just as good.
        return;

    // we already know that we have to yield as one of baseFontSize
    // or relativeFontSize is defined in this level/instance.
    // we don't know yet which one to take from local and which one to
    // inherit.
    // Ideally, if none of the args come from this level,
    // I don't want to evaluate the value, and just expect that
    // there will be an inherited value or a default in the Typespecnion.
    // The calling code could evaluate this. If none of the arguments
    // are local, don't define this derived value.
    // And, I don't want to resolve a dependency graph, so order is
    // relevant and the SyntethicValue are calculated in order, but likely
    // after all local generators have finished. So simple values that will
    // be yielded later will be available as well, also the results of
    // SynthethicValues that have been yielded before.
    function calculate(baseFontSize, relativeFontSize) {
        if(baseFontSize === null)
            return null;
        const fontSizeValue = baseFontSize * (relativeFontSize === null
                                    ? 1
                                    : relativeFontSize);
        return fontSizeValue;
    }
    const args = [`${GENERIC}baseFontSize`, `${GENERIC}relativeFontSize`];
    // if either baseFontSize or relativeFontSize is defineded we should
    // yield the changed font size value.
    yield [`${GENERIC}fontSize`, new SyntethicValue(calculate, args)];
}

/**
 * hostInstance implements manualAxesLocationsModelMixin
 *              and fontSize
 * yield [propertyName, propertyValue]
 */
function* axisLocationsGen(outerTypespecnionAPI, hostInstance/* here a TypeSpecModel */) {
      // fontSize = hostInstance.get('fontSize')
      // => this is interesting, if hostInstance defines fontSize, we
      //    definitely use that, otherwise, going only via
      // outerAnimanionAPI.getProperty(`${GENERIC}fontSize`)
    const autoOPSZ = hostInstance.get('autoOPSZ').value;
    if(autoOPSZ) {
        // autoOPSZ => opsz is the same pt value as the fontSize that
        // is applied to this level.
        //
        // if this remains the only useful case for outerTypespecnionAPI.getProperty
        // it should probably be replaced with some more powerful api
        // It would be nice if `${GENERIC}fontSize` would be
        // sufficient here! but maybe we need to decide when not to
        // use it.
        //if(baseFontSizeValue !== null)

        // this is effectively an alias of fontSize.
        // this should only result in a value if fontSizeValue doesn't
        // resolve to null, in which case using the inherited value
        // is correct, e.g like no yielding this.
        yield [`axesLocations/opsz`,  new SyntethicValue(identity, [`${GENERIC}fontSize`])];
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
    'textAlign', 'direction', 'columnWidth'
]));

function getPropertiesBroomWagonGen(prefix, fieldsSet) {
    return function* propertiesBroomWagonGen(outerTypespecnionAPI, hostInstance) {
        for(const fieldName of hostInstance.keys()) {
            if(!fieldsSet.has(fieldName))
                continue;
            const item = hostInstance.get(fieldName)
              , path = Object.freeze([fieldName])
              ;
            yield* childrenPropertiesBroomWagonGen(prefix, path, item);
        }
    }
}

export function initTypeSpecnion(typeSpec) {
    const propertiesGenerators = [
            // numericPropertiesGen
            colorsGen
          , fontGen
          , baseFontSizeGen
          , fontSizeGen // must come before axisLocationsGen
          , axisLocationsGen
          , getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPESPEC_FIELDS)
          , leadingGen
    ];
    return new LocalScopeTypeSpecnion(propertiesGenerators, typeSpec);
}

export class TypeSpecLiveProperties extends _BaseComponent {
    constructor(widgetBus, initTypeSpecnion, typeSpecDefaultsMap, isInheritingPropertyFn=null) {
        super(widgetBus);
        this._initTypeSpecnion = initTypeSpecnion;
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
        // only used if also hasParentProperties
        this._isInheritingPropertyFn = isInheritingPropertyFn;
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
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
                                  , this._typeSpecDefaultsMap
                                  , parentProperties.typeSpecnion
                                  , this._isInheritingPropertyFn
                                  );
                    typeSpecnionChanged = true;
                }
            }
            else {
                this._typeSpecnion =  new HierarchicalScopeTypeSpecnion(
                                      this._initTypeSpecnion(typeSpec)
                                    , this._typeSpecDefaultsMap
                                   // potentiallly, here a local typespecnion with a typespec populated withh all the default values...
                                );
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


function* axisMathLocationsGen(outerTypespecnionAPI, hostInstance/* here a TypeSpecModel */) {
    const axesLocations = hostInstance.get('axesLocations');
    for(const [axisTag, axisValue] of axesLocations) {
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

const _GENERIC_STYLEPATCH_FIELDS = Object.freeze(new FreezableSet([
    'autoOPSZ' // not handled via axesLocations in this case
]));

/**
 * This is to determine and cache the set of properties of a StylePatch.
 * for a SimpleStylePatch, this would not really be necessary, but the
 * CompositeStylePatch requires some rules and the result can be reused
 * by each StyleLink without re-processing.
 */
export class StylePatchSourceLiveProperties extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this.propertyValuesMap = null;

        // keys in a SimpleStylePatch are so far:
        //      baseFontSize, relativeFontSize, textColor,
        //      backgroundColor, axesLocations, autoOPSZ, activeFontKey,
        //      font, installedFonts

        this._propertiesGenerators = [
             colorsGen /* re-used */
           , fontGen
           , baseFontSizeGen /* re-used */
             // Not sure if the treatment of autoOPSZ in axisLocationsGen
             // is actually OK! It could be! Then we could re-use it in
             // here!
             // NOTE also that in this case the values are AxesMathAxisLocationValueModel
             // which need resolution when the font is aussured to be known
             // i.e. where this patch and the typeSpec get mixed.
           , axisMathLocationsGen
           , getPropertiesBroomWagonGen(GENERIC, _GENERIC_STYLEPATCH_FIELDS) /* lind of re-used */
        ];
    }

    *_propertiesGenerator(simpleStylePatch) {
        for(const gen of this._propertiesGenerators.values()) {
            yield *  gen(
                    // outerTypespecnionAPI
                    {
                        // keeping these for now so we can re-use generators
                        // from initTypeSpecnion.
                        hasParentProtperty: ()=>false
                      , getParentProperty: (...args)=>{ throw new Error(`KEY ERROR ${this}.getParentProperty ${args.join(',     ')}`); }
                    }
                  , simpleStylePatch
                );
        }
    }

    _resolveStylePatchRecursive(allStylePatchesMap, currentKeys, childResultsCache, stylePatch) {
        const typeKey = stylePatch.get('stylePatchTypeKey').value
          , instance = stylePatch.get('instance')
          ;
        if(typeKey === 'SimpleStylePatch')
            return Array.from(this._propertiesGenerator(instance.wrapped));

        if(typeKey === 'CompositeStylePatch') {
            const styleKeys = instance.get('styles')
              , result = []
              ;
            for(const [,keyItem] of styleKeys) {
                const key = keyItem.value;
                let childResult;
                if(currentKeys.has(key))
                    // don't follow circular references
                    continue;
                const childStylePatch = allStylePatchesMap.get(key);
                if(childResultsCache.has(key))
                    childResult = childResultsCache.get(key);
                else {
                    const currentChildKeys = new Set([...currentKeys, key]);
                    childResult = this._resolveStylePatchRecursive(allStylePatchesMap, currentChildKeys, childResultsCache, childStylePatch);
                    childResultsCache.set(key, childResult);
                }
                for(const item of childResult)
                    result.push(item);
            }
            return result;
        }
        throw new Error(`NOT IMPLEMENTED ${this}._getPropertyValuesMap `
                      + `don't know how to handle type "${typeKey}".`);
    }

    _getPropertyValuesMap(stylePatch) {
        const allStylePatchesMap = this.getEntry('stylePatchesSource')
          , currentChildKeys = new Set()
          , childResultsCache = new Map()
          ;
        return new Map(this._resolveStylePatchRecursive(allStylePatchesMap, currentChildKeys, childResultsCache, stylePatch));
    }

    update(changedMap) {
        if(changedMap.has('stylePatch')) {
            const stylePatch = changedMap.get('stylePatch');
            this.propertyValuesMap = this._getPropertyValuesMap(stylePatch);
            // This updates (subsequent) subscribers.
            const [identifier, protocolHandlerImplementation] = this.widgetBus.getProtocolHandlerRegistration(`stylePatchProperties@`);
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }
}

class StylePatchSourcesMeta extends _BaseDynamicMapContainerComponent {
    // NOTE: in here we could probably handle changed as changed just fine.
    // I'm not sure if it would be an optimization though, however,
    // so far _BaseDynamicMapContainerComponent raises if HANDLE_CHANGED_AS_NEW
    // is not true a NOT IMPLEMENTED ERROR.
    [HANDLE_CHANGED_AS_NEW] = true;
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        return [
            {
                rootPath
              , 'stylePatchProperties@': rootPath.toString()
            }
          , [
                ['.', 'stylePatch']
              , [this.widgetBus.getExternalName('collection'), 'stylePatchesSource']
            ]
          , StylePatchSourceLiveProperties
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

class TypeSpecChildrenMeta extends _BaseDynamicMapContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
    constructor(widgetBus, zones, initTypeSpecnionFn
            , typeSpecDefaultsMap, isInheritingPropertyFn
            , widgets=[]) {
        super(widgetBus, zones, widgets);
        this._initTypeSpecnionFn = initTypeSpecnionFn;
        this._isInheritingPropertyFn = isInheritingPropertyFn;
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
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
          , this._initTypeSpecnionFn
          , this._typeSpecDefaultsMap
          , this._isInheritingPropertyFn
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
    constructor(widgetBus, zones, initTypeSpecnionFn, typeSpecDefaultsMap, isInheritingPropertyFn) {
        const widgets = [
            [
                {
                    'typeSpecProperties@': widgetBus.rootPath.toString()
                }
              , [  ...widgetBus.wrapper.getDependencyMapping(widgetBus.wrapper.constructor.DEPENDECIES_ALL) ]
              , TypeSpecLiveProperties
              , initTypeSpecnionFn // This usage instance won't receive parentProperties.????
              , typeSpecDefaultsMap
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
              , typeSpecDefaultsMap
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
        if(changedMap.has('text'))
            this.node.data = changedMap.get('text').value;
    }
}

export class UIDocumentElementTypeSpecDropTarget extends _BaseDropTarget {
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
                ['generic/textAlign', 'text-align', '']
              , ['generic/direction', 'direction', '']
                // it's more complex, should get basefontSize and multiply with that
                // to determine the PT
                //, ['generic/columnWidth', 'width', 'em', val=>val*0.5/*it's supposed to be EN*/]
              , ['generic/columnWidth', (element, value, propertiesValueMap, getDefault/*, useUnit*/)=>{
                    const [, baseFontSize] = getPropertyValue(
                            propertiesValueMap, getDefault, 'generic/baseFontSize')
                      , columnWidthPT = value  * baseFontSize * 0.5
                      ;
                    element.style.setProperty('width', `${columnWidthPT}pt`);
                }]
              , [`${LEADING}leading/line-height-em`, 'line-height', 'em']
            ]
          , propertyValuesMap = (changedMap.has('properties@')
                        ? changedMap.get('properties@')
                        : this.getEntry('properties@')).typeSpecnion.getProperties()
          ;



        // console.log(`${this}.update propertyValuesMap:`, ...propertyValuesMap.keys());
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
            // console.log(`${this}.update propertyValuesMap ...`, ...propertyValuesMap.keys(), '!', propertyValuesMap);
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

// This should inject it's own e.g. <p> element.
// It's interesting, the "nodesContainer" might have to change when the
// typeSpec changes! Thus, creating nodesContainer in the constructor might
// be not ideal. Definitely must look at the 'node'/'typeSpec@' in update.
//
// We could just copy all the content nodes when we change the nodesContainer,
// a child, thus, should not save the parent container ever.
// Interesting how/if insertElement plays along.
class UIDocumentElement extends _BaseContainerComponent {
    constructor(widgetBus, _zones, originTypeSpecPath, baseClass='typeroof-document-segment') {
        const nodesContainer = widgetBus.domTool.createElement('div', {'class': baseClass})
          , localContainer = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones
                , ['nodes', nodesContainer], ['local', localContainer]
            ])
          ;
        localContainer.append(nodesContainer);
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
              , UIDocumentElementTypeSpecDropTarget
              , 'drop TypeSpec'
              , ''
              , [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH]
            ]
          , [
                {   zone: 'nodes'
                  , rootPath: Path.fromParts('.', 'nodes')
                }
              , [
                    ['.', 'collection']
                ]
              , UIDocumentNodes
              , this._zones
              , originTypeSpecPath
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

    _createTypeSpecStylerWrapper(typeSpecProperties) {
        const settings = {}
          , dependencyMappings = [
                [typeSpecProperties, 'properties@']
              , ['/font', 'rootFont']
            ]
          , Constructor = UIDocumentSegmentTypeSpecStyler
          , args = [this._zones.get('nodes')]
          ;
         return this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _provisionWidgets(/* compareResult */) {
        // if typeSpecLink has changed or if typeSpecProperties@ of id: 'type-spec-styler' does not exist
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
            this._typeSpecStylerWrapper = this._createTypeSpecStylerWrapper(typeSpecProperties);
            this._widgets.splice(0, 0, this._typeSpecStylerWrapper);
        }
        else {
            const oldWrapper = this._widgets[oldId];
            if(oldWrapper.dependencyReverseMapping.get('typeSpecProperties@') !== typeSpecProperties) {
                const newWrapper = this._createTypeSpecStylerWrapper(typeSpecProperties);
                this._widgets.splice(oldId, 1, newWrapper);
                oldWrapper.destroy()
                this._typeSpecStylerWrapper = newWrapper;
            }
        }
        return super._provisionWidgets();
    }
}

class UIDocumentNode extends _BaseContainerComponent {
    constructor(widgetBus, zones, originTypeSpecPath) {
        super(widgetBus, zones);
        this._originTypeSpecPath = originTypeSpecPath;
        this._currentTypeKey = null;
    }

    _createWrapperForType(typeKey) {
        const settings = {
               // document/nodes/{key}
               rootPath: Path.fromParts('.', 'instance')
             , zone: 'nodes'
            };
        let Constructor
          , dependencyMappings
          ;
        if(typeKey === 'Element') {
            dependencyMappings = [
                'typeSpecLink'
              , 'nodes'
            ];
            Constructor = UIDocumentElement;
        }
        else if(typeKey === 'TextRun') {
            dependencyMappings = [
                'stylePatchLinkOrEmpty'
              , 'text'
            ];
            Constructor = UIDocumentTextRun;
        }
        else
            throw new Error(`KEY ERROR unknown typeKey ${typeKey}.`);

        const args = [this._zones, this._originTypeSpecPath]
          , childWidgetBus = this._childrenWidgetBus
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _provisionWidgets(/* compareResult */) {
        const node = this.getEntry('.')
          , typeKey = node.get('documentNodeTypeKey').value
          ;
        if(this._currentTypeKey === typeKey)
            return new Set();
        this._currentTypeKey = typeKey;
        const newWrapper = this._createWrapperForType(typeKey)
          , deleted = this._widgets.splice(0, Infinity, newWrapper)
          ;
        for(const wrapper of deleted)
            wrapper.destroy();
        return super._provisionWidgets();
    }
}

// It's interesting on the one hand, each segment requires it's own
// control, e.g. to change the typeSpecLink, on the other hand,
// it requires the data to render properly, and that is very depending
// on the settings.
class UIDocumentNodes extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, originTypeSpecPath) {
        super(widgetBus, zones);
        this._originTypeSpecPath = originTypeSpecPath;
    }
    _createWrapper(rootPath) {
        const settings = {
               // document/nodes/{key}
               rootPath: rootPath
             , zone: 'nodes'
            }
          , dependencyMappings = [
                // ['.', 'segment']
            ]
          , Constructor = UIDocumentNode
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
                , ['nodes', documentContainer]
            ])
          ;
        widgetBus.insertElement(documentContainer);
        super(widgetBus, zones);
        const widgets = [
            [
                {   zone: 'nodes'
                  , rootPath: Path.fromParts('.', 'document')
                }
              , [
                    ['nodes', 'collection']
                ]
              , UIDocumentNodes
              , this._zones
              , originTypeSpecPath
            ]
        ];
        this._initWidgets(widgets);
    }
}

const _skipPrefix = new Set([
    // This is very complicated as axesLocations have different default
    // values depending on the actual font. So if there's no font, there
    // can't be a value. This is why modelDefaultValue is injected, because
    // the caller may know a default value, but it may also not know, there's
    // no guarantee!
    'axesLocations/'
    // "font" is really the only case of this so far, there could
    // be the document font as a default maybe, as it cannot be not
    // set at all, hence it also must be loaded and available.
  , SPECIFIC
  // not yet thought through
  , 'stylePatches/'
]);
function _getTypeSpecDefaultsMap(typeSpecDependencies) {
    const defaultTypeSpec = (()=>{
            const draft = TypeSpecModel.createPrimalDraft(typeSpecDependencies);
            for(const [fieldName, ppsRecord] of TYPESPEC_PPS_MAP){
                if(_skipPrefix.has(ppsRecord.prefix))
                    continue;
                if(ppsRecord.prefix == COLOR) {
                    const defaultValue = typeSpecGetDefaults(()=>null, ppsRecord, fieldName)
                      , color = culoriToColor(defaultValue, draft.dependencies)
                      ;
                    draft.set(fieldName, color);
                }
                else if(ppsRecord.prefix == LEADING) {
                    const defaultValue = typeSpecGetDefaults(()=>null, ppsRecord, fieldName)
                      , leading = deserializeLeadingAlgorithmModel(draft.dependencies, defaultValue)
                      ;
                    draft.set(fieldName, leading);
                }
                else {
                    const defaultValue = typeSpecGetDefaults(()=>null, ppsRecord, fieldName);
                    draft.get(fieldName).value = defaultValue;
                }
            }
            return draft.metamorphose();
        })()
      , defaultTypeSpecnion = initTypeSpecnion(defaultTypeSpec)
      ;
    defaultTypeSpecnion.initPropertyValuesMap(new Map());
    const typeSpecDefaultsMap = new FreezableMap(defaultTypeSpecnion.getPropertyValuesMap());
    Object.freeze(typeSpecDefaultsMap);
    return typeSpecDefaultsMap
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

        widgetBus.wrapper.setProtocolHandlerImplementation(
             ...SimpleProtocolHandler.create('stylePatchProperties@'));

        // widgetBus.insertElement(stageManagerContainer);
        super(widgetBus, zones);

        collapsibleMixin(typeSpecManagerContainer, 'legend');
        collapsibleMixin(propertiesManagerContainer, 'legend');
        collapsibleMixin(stylePatchesManagerContainer, 'legend');

        const typeSpecDefaultsMap = _getTypeSpecDefaultsMap(widgetBus.getEntry(originTypeSpecPath).dependencies);

        const widgets = [
            [
                {
                    rootPath: widgetBus.rootPath
                }
                , [['stylePatchesSource', 'collection']]
                , StylePatchSourcesMeta
                , zones
            ]
          , [
                {
                    rootPath: typeSpecRelativePath
                }
              , [['.', 'typeSpec']]
              , TypeSpecMeta
              , zones
              , initTypeSpecnion
              , typeSpecDefaultsMap
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
              , 'Styles Manager'
            ]
          , [
                {   zone: 'style_patches-manager'
                  , relativeRootPath: Path.fromParts('.', 'stylePatchesSource')
                }
              , [
                    ['.', 'childrenOrderedMap']
                  , ['../editingStylePatch', 'stylePatchPath']
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
                  , DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH
                    // to delete the axesLocations values coming from UIAxesMathLocation
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                ]
            ]
         , [
               {
                   zone: 'style_patches-manager'
                 , relativeRootPath: Path.fromParts('.', 'stylePatchesSource')
               }
             , [
                    ['.', 'childrenOrderedMap']
                  , ['../editingStylePatch', 'stylePatchPath']
               ]
             , StylePatchPropertiesManager
             , new Map([...zones, ['main', stylePatchesManagerContainer]])
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
