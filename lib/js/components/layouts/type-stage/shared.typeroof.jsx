import {
    _BaseComponent,
    _CommonContainerComponent,
    _BaseDynamicCollectionContainerComponent,
} from "../../basics/component.mjs";
import { createIcon } from "../../icons.mjs";
import { Path, getEntry } from "../../../metamodel.mjs";
import { StaticTag } from "../../generic.mjs";

export class MapSelectButton extends _BaseComponent {
    constructor(
        widgetBus,
        eventListeners = [],
        classes = [],
        labels = {
            unselect: createIcon("edit_off"),
            select: createIcon("edit"),
        },
    ) {
        super(widgetBus);
        [this.element] = this._initTemplate(eventListeners, classes);
        this._labels = labels;
        this._activeState = null;
    }

    _getTemplate(h) {
        return <button class="ui_map_select_button">(initial)</button>;
    }

    _initTemplate(eventListeners = [], classes = []) {
        const element = this._getTemplate(this._domTool.h);
        for (const eventListener of eventListeners)
            element.addEventListener(...eventListener);
        for (const class_ of classes) element.classList.add(class_);
        this._insertElement(element);
        return [element];
    }

    _setActive(pathEntry) {
        let shouldBeActive = false;
        if (!pathEntry.isEmpty) {
            const myKey = this.widgetBus.rootPath.parts.at(-1), // .../{key}
                path = pathEntry.value,
                selectedKey = path.parts.at(-1); // ./key
            shouldBeActive = myKey === selectedKey;
        }
        if (this._activeState !== shouldBeActive) {
            this.element.classList[shouldBeActive ? "add" : "remove"]("active");
            this._activeState = shouldBeActive;
            this._domTool.clear(this.element);
            const label =
                this._labels[this._activeState ? "unselect" : "select"];
            this._domTool.appendChildren(this.element, label ?? "Select");
        }
    }

    update(changedMap) {
        if (changedMap.has("activePath")) {
            const pathEntry = changedMap.get("activePath");
            this._setActive(pathEntry);
        }
    }
}

/**
 * FIXME: this is also kind of a repeated pattern TypeSpecPropertiesManager
 * looks similar, however the details are a bit different because of the
 * different addressing in TypeSpec.
 * This version has diverged from the _BaseByPathPropertiesManager version
 * in type-spec-ramp. It makes typeKeyName optional, so, in that case
 * the type is disregarded. And the name became more generic.
 */
export class _BaseByPathContainerComponent extends _CommonContainerComponent {
    initialUpdate =
        _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    constructor(
        widgetBus,
        _zones,
        className,
        pathEntryName,
        childrenMapEntryName,
        typeKeyName = null,
    ) {
        const localZoneElement = widgetBus.domTool.createElement("div", {
                class: className,
            }),
            zones = new Map([..._zones, ["local", localZoneElement]]);
        widgetBus.insertElement(localZoneElement);
        // provision widgets dynamically!
        super(widgetBus, zones);
        this._pathEntryName = pathEntryName;
        this._childrenMapEntryName = childrenMapEntryName;
        this._typeKeyName = typeKeyName;
        this._currentTypeKey = null;
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName(this._pathEntryName));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName(this._pathEntryName));
        return dependencies;
    }
    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult),
            pathOrEmpty = changedMap.has(this._pathEntryName)
                ? changedMap.get(this._pathEntryName)
                : this.getEntry(this._pathEntryName),
            // in this case path is absolute, I believe
            rootPath = Path.fromString(
                this.widgetBus.getExternalName(this._childrenMapEntryName),
            ),
            path = !pathOrEmpty.isEmpty
                ? rootPath.append(...pathOrEmpty.value)
                : null,
            childrenMap = changedMap.has(this._childrenMapEntryName)
                ? changedMap.get(this._childrenMapEntryName)
                : this.getEntry(this._childrenMapEntryName),
            item = !pathOrEmpty.isEmpty
                ? // If path can't be resolved item becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                  getEntry(childrenMap, pathOrEmpty.value, null)
                : null,
            typeKey =
                item === null || this._typeKeyName === null
                    ? null
                    : item.get(this._typeKeyName).value,
            typeChanged = this._currentTypeKey !== typeKey,
            rebuild = changedMap.has(this._pathEntryName) || typeChanged;
        this._currentTypeKey = typeKey;
        if (rebuild) {
            // deprovision widgets
            for (const widgetWrapper of this._widgets) widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set(),
            widgetWrappers = [];
        if (rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            if (item !== null) {
                widgetWrappers.push(...this._createItemWrappers(path, item));
            } else {
                widgetWrappers.push(...this._createEmptyWrappers());
            }
        }

        this._widgets.push(...widgetWrappers);
        for (const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }
        return requiresFullInitialUpdate;
    }

    _createEmptyWrappers() {
        const widgets = [
            [{ zone: "local" }, [], StaticTag, "span", {}, "(Select an item)"],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(editingNodePath, item) {
        const widgets = [
            [
                { zone: "local" },
                [],
                StaticTag,
                "span",
                {},
                `(_createItemWrappers is not implemented ${item} ${editingNodePath})`,
            ],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}
