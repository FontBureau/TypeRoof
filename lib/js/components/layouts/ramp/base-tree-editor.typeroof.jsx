import { _BaseComponent } from "../../basics.mjs";
import { createIcon } from "../../icons.mjs";
import { Path, getEntry } from "../../../metamodel.mjs";

function _uniqueKey(keys) {
    const keysSet = new Set(keys),
        numericKeys = new Set();
    let highest = null;
    for (const key of keysSet) {
        const num = parseFloat(key);
        if (!isFinite(num)) continue;
        if (numericKeys.has(num)) continue;
        numericKeys.add(num);
        if (highest === null || num > highest) highest = num;
    }
    let keyNum = highest === null ? 0 : Math.ceil(highest),
        newKey = `${keyNum}`;
    while (keysSet.has(newKey)) {
        // will in each iteration at least add 1
        do {
            keyNum += 1;
        } while (numericKeys.has(keyNum));
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
export class _BaseTreeEditor extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="tree_editor stage-manager_actors">(initial)</div>`;
    // jshint ignore:end
    constructor(widgetBus, dataTransferTypes) {
        super(widgetBus);
        this._dataTransferTypes = Object.freeze(
            Object.assign({}, dataTransferTypes),
        );
        this._itemElements = new Map(/* Path: element*/);
        this._activePaths = new Set();
        this._removeDragIndicatorTimeoutId = null;
        [this.element, this._actorsElement] = this.initTemplate();
    }

    _onClickHandler(path) {
        this._changeState(() => {
            // this is a toggle
            const editingActor = this.getEntry("editingActor");
            if (!editingActor.isEmpty && editingActor.value.equals(path))
                editingActor.clear();
            else editingActor.value = path;
        });
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ),
            element = frag.firstElementChild,
            actors = frag.querySelector(".stage-manager_actors");
        this._insertElement(element);
        actors.addEventListener("dragleave", this._dragleaveHandler.bind(this));
        return [element, actors];
    }

    get DATA_TRANSFER_TYPES() {
        return this._dataTransferTypes;
    }

    _dragstartHandler({ path }, event) {
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        const type = this.DATA_TRANSFER_TYPES.PATH;
        event.dataTransfer.setData(type, `${path}`);
        event.dataTransfer.setData("text/plain", `[TypeRoof ${type}: ${path}]`);

        event.currentTarget.classList.add("dragging");
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = "all";
        event.dataTransfer.setDragImage(
            event.currentTarget.parentElement,
            0,
            0,
        );
    }

    _dragendHandler(item /*{path}*/, event) {
        event.currentTarget.classList.remove("dragging");
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [
            this.DATA_TRANSFER_TYPES.PATH,
            this.DATA_TRANSFER_TYPES.CREATE,
        ];
        for (const type of applicableTypes) {
            if (event.dataTransfer.types.includes(type)) {
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
        if (!take) return;
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
        event.dataTransfer.dropEffect =
            type === this.DATA_TRANSFER_TYPES.PATH ? "move" : "copy"; // this.DATA_TRANSFER_TYPES.CREATE
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        event.dataTransfer.dropEffect =
            type === this.DATA_TRANSFER_TYPES.PATH ? "move" : "copy"; // this.DATA_TRANSFER_TYPES.CREATE
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _getDropTargetInsertPosition(item, event) {
        if (item.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return "insert";
        const { height, top } = event.currentTarget.getBoundingClientRect(),
            { clientY } = event,
            elementY = clientY - top,
            relativeY = elementY / height,
            testPosition = item.isEmptyLayerItem
                ? // Move this line below the empty layer container <ol> active
                  // zone, such that we don't get undecided flickering between
                  // the empty container zone and the item above: the <li> that
                  // contains the empty children <ol>.
                  0.8
                : 0.5;
        return relativeY < testPosition ? "before" : "after";
    }

    _setDropTargetIndicator(element, insertPosition = null) {
        if (this._removeDragIndicatorTimeoutId !== null) {
            const { clearTimeout } = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = "drop_target_indicator-",
            markedClass = `${classPrefix}marked`;
        for (const elem of this._actorsElement.querySelectorAll(
            `.${markedClass}`,
        )) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for (const name of [...elem.classList]) {
                if (name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if (insertPosition === null) return;

        if (!["before", "after", "insert"].includes(insertPosition))
            throw new Error(
                `NOT IMPLEMENTED ${this} insert position "${insertPosition}".`,
            );
        // return;

        const [elem, posClassSuffix] =
            insertPosition === "before" && element.previousSibling
                ? [element.previousSibling, "after"]
                : [element, insertPosition];
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
        if (!this._takeDragEventOrLeaveIt(event)[0]) return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const { setTimeout } = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(
            this._setDropTargetIndicator.bind(this, event.currentTarget),
            100,
        );
    }

    _dropHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;

        this._setDropTargetIndicator(event.currentTarget);

        const { path } = item,
            rootPath = Path.fromString(
                this.widgetBus.getExternalName("activeActors"),
            ),
            targetPath = rootPath.append(...path),
            insertPosition = this._getDropTargetInsertPosition(item, event);
        if (type === this.DATA_TRANSFER_TYPES.PATH) {
            const relativeSourcePath = event.dataTransfer.getData(
                    this.DATA_TRANSFER_TYPES.PATH,
                ),
                sourcePath = rootPath.appendString(relativeSourcePath);
            return this._move(sourcePath, targetPath, insertPosition);
        } else if (type === this.DATA_TRANSFER_TYPES.CREATE) {
            const typeKey = event.dataTransfer.getData(
                this.DATA_TRANSFER_TYPES.CREATE,
            );
            return this._create(typeKey, targetPath, insertPosition);
        }
    }

    _create(typeKey, targetPath, insertPosition) {
        // console.log(`${this}._create typeKey: ${typeKey} targetPath ${targetPath} insertPosition: ${insertPosition}`);
        return this._changeState(() => {
            const activeActors =
                    insertPosition === "insert"
                        ? this.getEntry(targetPath)
                        : this.getEntry(targetPath.parent), // is an 'ActorsModel' ('activeActors')
                // Ensure we take the dependencies for the create from the
                // correct element, even though, at the moment, the dependencies
                // are all identical, it may change at some point.
                newActor = this._createItem(typeKey, activeActors.dependencies),
                uniqueKey = _uniqueKey(activeActors.keys()),
                newEntry = [uniqueKey, newActor];
            if (insertPosition === "insert") {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // targetParent === sourceParent and the targetKey could
                // change is circumvented.

                // NOTE: as an ordered dict, this requires a new unique key
                // a list doesn't require that at all!
                activeActors.push(newEntry);
                return;
            }
            const targetKey = targetPath.parts.at(-1),
                targetIndex = activeActors.indexOfKey(targetKey);
            if (insertPosition === "after")
                activeActors.arraySplice(targetIndex + 1, 0, newEntry);
            else if (insertPosition === "before")
                activeActors.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(
                    `NOT IMPLEMENTED insert position "${insertPosition}".`,
                );
        });
    }

    // FIXME: especially in move reference may require updating
    //        however, with a Map as container the situation should
    //        be much more stable.
    _move(sourcePath, targetPath, insertPosition) {
        // console.log(`${this}._move sourcePath: ${sourcePath} targetPath ${targetPath}`);
        const canMove = !sourcePath.isRootOf(targetPath);
        if (!canMove) {
            console.warn(
                `${this}._move can't move source into target as source path "${sourcePath}" is root of target path "${targetPath}".`,
            );
            return;
        }

        return this._changeState(() => {
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const activeActors =
                    insertPosition === "insert"
                        ? this.getEntry(targetPath)
                        : this.getEntry(targetPath.parent), // is an 'ActorsModel' ('activeActors')
                sourceParent = this.getEntry(sourcePath.parent),
                sourceKey = sourcePath.parts.at(-1),
                source = sourceParent.get(sourceKey),
                newEntry = [null, source];
            if (insertPosition === "insert") {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                // We may preserve the old key if it is free.
                const uniqueKey = activeActors.has(sourceKey)
                    ? _uniqueKey(activeActors.keys())
                    : sourceKey;
                newEntry[0] = uniqueKey;
                activeActors.push(newEntry);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1),
                targetIndex = activeActors.indexOfKey(targetKey),
                sourceIndex = sourceParent.indexOfKey(sourceKey);
            if (activeActors === sourceParent) {
                if (sourceIndex === targetIndex) return; // nothing to do
                let insertIndex;
                if (insertPosition === "after") insertIndex = targetIndex + 1;
                else if (insertPosition === "before") insertIndex = targetIndex;
                else
                    throw new Error(
                        `NOT IMPLEMENTED ${this} insert position "${insertPosition}".`,
                    );

                if (sourceIndex < targetIndex)
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
                : sourceKey;
            newEntry[0] = uniqueKey;
            sourceParent.delete(sourceKey);
            if (insertPosition === "after")
                activeActors.arraySplice(targetIndex + 1, 0, newEntry);
            else if (insertPosition === "before")
                activeActors.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(
                    `NOT IMPLEMENTED insert position "${insertPosition}".`,
                );
        });
    }

    _renderLayer(path, activeActors, state = null) {
        const container = this._domTool.createElement("ol");
        if (activeActors.size === 0) {
            // empty container
            const item = {
                path,
                isEmptyLayerContainer: true,
                isEmptyLayerItem: false,
            };
            container.addEventListener(
                "dragenter",
                this._dragenterHandler.bind(this, item),
            );
            container.addEventListener(
                "dragover",
                this._dragoverHandler.bind(this, item),
            );
            container.addEventListener(
                "drop",
                this._dropHandler.bind(this, item),
            );
        } // else: see for ...
        for (const [key, actor] of activeActors) {
            const itemElement = this._domTool.createElement("li"),
                itemPath = path.append(key),
                dragHandleElement = this._domTool.createElement(
                    "span",
                    { class: "drag_handle" },
                    createIcon("drag_pan"),
                ),
                // used to check:  isLayerItem = getEntry(actor , Path.fromParts('actorTypeModel', 'typeClass')).value === LayerActorModel
                isContainerItem = this._isContainerItem(actor),
                isEmptyLayerItem = isContainerItem
                    ? getEntry(actor, this._containerRelPathToChildren).size ===
                      0
                    : false,
                item = {
                    path: itemPath,
                    isEmptyLayerContainer: false,
                    isEmptyLayerItem,
                };
            if (state) {
                itemElement.classList.add(
                    state.counter % 2 ? "even-row" : "odd-row",
                );
                itemElement.style.setProperty(
                    "--structural-depth",
                    `${state.depth}`,
                );
                state.counter += 1;
            }

            dragHandleElement.setAttribute("draggable", "true");
            dragHandleElement.addEventListener(
                "dragstart",
                this._dragstartHandler.bind(this, item),
            );
            dragHandleElement.addEventListener(
                "dragend",
                this._dragendHandler.bind(this, item),
            );

            itemElement.addEventListener(
                "dragenter",
                this._dragenterHandler.bind(this, item),
            );
            itemElement.addEventListener(
                "dragover",
                this._dragoverHandler.bind(this, item),
            );
            itemElement.addEventListener(
                "drop",
                this._dropHandler.bind(this, item),
            );

            itemElement.append(
                dragHandleElement,
                ...this._renderActor(itemPath, actor, state),
            );
            container.append(itemElement);
            this._itemElements.set(itemPath.toString(), itemElement);
        }
        return [container];
    }

    _renderActor(path, actor, state = null) {
        const fragment = this._domTool.createFragmentFromHTML(
                `<button><span></span> <em></em></button>`,
            ),
            result = [...fragment.childNodes],
            button = fragment.querySelector("button");
        button.addEventListener("click", this._onClickHandler.bind(this, path));
        fragment.querySelector("span").textContent = this._getItemLabel(actor);
        button.setAttribute("title", `local path: ${path}`);
        if (this._isContainerItem(actor)) {
            // used to be if(typeClass === LayerActorModel) {
            const activeActorsPath = this._containerRelPathToChildren,
                activeActors = getEntry(actor, activeActorsPath),
                childrenPath = path.append(...activeActorsPath);
            if (state) state.depth += 1;
            result.push(
                ...this._renderLayer(childrenPath, activeActors, state),
            );
            if (state) state.depth -= 1;
        }
        return result;
    }

    _markActiveItems(...pathsToActivate) {
        for (const activePathStr of this._activePaths) {
            this._itemElements.get(activePathStr).classList.remove("active");
        }
        this._activePaths.clear();
        for (const activePath of pathsToActivate) {
            const activePathStr = activePath.toString();
            if (!this._itemElements.has(activePathStr)) {
                // FIXME: need to figure out.
                // deserializeing four-panels-wip-0004_slides_as_layers.txt
                // triggers this. It's not critical though.
                console.error(
                    `${this}._markActiveItems not found path "${activePathStr}" ` +
                        `in elements: ${Array.from(this._itemElements.keys()).join(", ")}`,
                );
                continue;
            }
            this._activePaths.add(activePathStr);
            this._itemElements.get(activePathStr).classList.add("active");
        }
    }

    update(changedMap) {
        const editingActor = changedMap.has("editingActor")
            ? changedMap.get("editingActor")
            : this.getEntry("editingActor");
        if (changedMap.has("activeActors")) {
            const activeActors = changedMap.get("activeActors"),
                basePath = Path.fromParts("./");
            this._domTool.clear(this._actorsElement);
            this._actorsElement.append(
                ...this._renderLayer(basePath, activeActors, {
                    counter: 0,
                    depth: 0,
                }),
            );
            if (!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        } else if (changedMap.has("editingActor")) {
            this._markActiveItems(
                ...(editingActor.isEmpty ? [] : [editingActor.value]),
            );
        }
    }

    _isContainerItem(/*item*/) {
        //return getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE;
        throw new Error(`NOT IMPLEMENTED ${this}._isContainerItem`);
    }

    _createItem(typeKey /*, dependencies*/) {
        throw new Error(
            `NOT IMPLEMENTED ${this}._createItem (for ${typeKey}).`,
        );
    }
    _getContainerRelPathToChildren() {
        // return Path.fromParts('instance', 'activeActors');
        throw new Error(
            `NOT IMPLEMENTED ${this}._getContainerRelPathToChildren`,
        );
    }

    get _containerRelPathToChildren() {
        return this._getContainerRelPathToChildren();
    }

    _getItemLabel(/*item*/) {
        throw new Error(`NOT IMPLEMENTED ${this}._getItemLabel`);
    }
}
