import { Path } from "../metamodel.mjs";

import {
  _BaseComponent,
  _BaseContainerComponent,
  _BaseDynamicMapContainerComponent,
  HANDLE_CHANGED_AS_NEW,
} from "./basics.mjs";

import { GenericSelect, StaticNode } from "./generic.mjs";

import { OTFeatureInfo } from "../ot-feature-info.mjs";

import {
  ProcessedPropertiesSystemMap,
  SPECIFIC,
} from "./registered-properties-definitions.mjs";

/* We have a list of all known features, but not all of these features
 * are set, they can as well be unset, and be inherited or just have the
 * default value.
 * This will "set" explicitly the feature tags to their default or inherited
 * value, so the user can change it.
 */
class UIOTFeaturesSetSelect extends GenericSelect {
  _isDisabledFn = null;
  _isHiddenFn = null;
  _featuesCache = null;
  _font = null;
  static OPTION_FILTERS = Object.fromEntries(
    ["IN_FONT", "ALL"].map((e) => [e, e]),
  );

  constructor(
    widgetBus,
    baseClass,
    labelContent,
    ppsRecordFont,
    allowNull = [],
    getDefaults,
    requireUpdateDefaults,
  ) {
    // optionGetLabel=null (key, value)=>label
    // allowNull=[]
    // onChangeFn=null (value)=>undefined
    // optionGetGroup=null (value)=>[groupKey, label, index]
    // optionsGen=null (availableOptions)=>... [key, value]
    // widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null
    super(
      widgetBus,
      baseClass,
      labelContent,
      null /* optionGetLabel*/,
      [
        false,
        ...allowNull.slice(1),
      ] /*, onChangeFn, optionGetGroup, optionsGen*/,
    );
    this._ppsRecord = ppsRecordFont;
    [this._allowNull = false] = allowNull;
    this._optionsFilter = this.constructor.OPTION_FILTERS.IN_FONT;
    this._getDefaults = getDefaults;
    this._requireUpdateDefaults = requireUpdateDefaults;
  }

  /* Override via constructor. */
  _optionGetLabel(key, value) {
    // const tagInfo = OTFeatureInfo.all[key];
    // value === tagInfo
    if (typeof value === "string")
      // for the null/placeholder option
      return value;
    return key in this._font.features
      ? `${key} – ${this._font.features[key].bestName}`
      : `[${key}] – ${value.friendlyName}`;
  }

  _optionGetGroup(value) {
    // return [groupKey, label, index];
    if (value === null)
      // for the null/placeholder option
      return super._optionGetGroup();
    const group = OTFeatureInfo.groups.get(value.group);
    if (!group) throw new Error(`KEY ERROR group "${value.group}" not found`);
    return [value.group, group.label, group.index];
  }

  *_optionsGen(/*font*/) {
    yield* Object.entries(OTFeatureInfo.ui);
  }

  async _changeSelectedValueHandler(/*event*/) {
    // this version doesn't use a 'value' dependency
    if (this._onChangeFn) this._onChangeFn(this.value);
  }

  _getIsHiddenFn() {
    if (this._optionsFilter === this.constructor.OPTION_FILTERS.IN_FONT) {
      return (value) => value !== "[_NULL_]" && !(value in this._font.features);
    } else if (this._optionsFilter === this.constructor.OPTION_FILTERS.ALL) {
      return null;
    }
    throw new Error(
      `NOT IMPLEMENTED for optionsFilter: "${this._optionsFilter}" known values: ${Object.values(this.constructor.OPTION_FILTERS).join(", ")}`,
    );
  }

  update(changedMap) {
    let updateRestrictions = false;
    if (changedMap.has("collection")) {
      const collection = changedMap.get("collection");
      this._isDisabledFn = (tag) => collection.has(tag);
      updateRestrictions = true;
    }

    const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
    if (changedMap.has("rootFont") || requireUpdateDefaults) {
      let font;
      if (requireUpdateDefaults) {
        const maybeFont = this._getDefaults(this._ppsRecord, "font", false);
        if (maybeFont) font = maybeFont;
      }
      if (!font)
        // rootFont can't (must not) be ForeignKey.NULL
        font = this.getEntry("rootFont").value;
      this._updateOptions(font);
    } else if (updateRestrictions) this._updateRestrictions();
  }

  _updateRestrictions() {
    const groups = new Map(
      Array.from(this._select.getElementsByTagName("optgroup")).map((group) => [
        group,
        group.getElementsByTagName("option").length,
      ]),
    );
    for (const option of this._select.options) {
      option.disabled = this._isDisabledFn
        ? this._isDisabledFn(option.value)
        : false;

      const isHidden = this._isHiddenFn
        ? this._isHiddenFn(option.value)
        : false;
      option.style.setProperty("display", isHidden === true ? "none" : null);
      if (isHidden && groups.has(option.parentElement)) {
        groups.set(option.parentElement, groups.get(option.parentElement) - 1);
      }
    }
    let visibleGroups = groups.size;
    for (const [group, counter] of groups) {
      const isHidden = counter === 0;
      group.style.setProperty("display", isHidden ? "none" : null);
      if (isHidden) visibleGroups -= 1;
    }
    this._select.disabled = visibleGroups === 0;
  }

  _updateOptions(font, ...args) {
    this._font = font;
    // will update via _optionsGen
    super._updateOptions(font, ...args);
    if (this._select.selectedIndex === -1) {
      this._select.options[0].selected = true;
    }
    this._isHiddenFn = this._getIsHiddenFn();
    this._updateRestrictions();
  }

  /* NOTE: this can be done outside of the update function as the
   * value is not persisted in the metamodel, it's purely ephemeral
   * behavior tweaking.
   */
  setOptionsFilter(filter) {
    this._optionsFilter = filter;
    this._isHiddenFn = this._getIsHiddenFn();
    this._updateRestrictions();
  }
}

export class UIBooleanOTFeature extends _BaseComponent {
  constructor(
    widgetBus,
    tagName,
    ppsRecord,
    getDefaults,
    requireUpdateDefaults,
  ) {
    super(widgetBus);
    [this.element, this._label, this._friendlyName, this._input] =
      this._initTemplate(tagName);
    this._tagName = tagName;
    this._ppsRecord = ppsRecord;
    this._getDefaults = getDefaults;
    this._requireUpdateDefaults = requireUpdateDefaults;
  }
  _getTemplate(h) {
    return (
      <div class="ui_boolean_ot_feature">
        <label>
          <input class="ui_boolean_ot_feature-input" type="checkbox" />{" "}
          <strong class="ui_boolean_ot_feature-label-content">
            (not initialized)
          </strong>{" "}
          –{" "}
          <span class="ui_boolean_ot_feature-friendly_name">
            (not initialized)
          </span>{" "}
          <button
            class="ui_boolean_ot_feature-remove ui_button ui_button-remove"
            title="remove"
          >
            ✖
          </button>
        </label>
      </div>
    );
  }
  _initTemplate(tagName) {
    const element = this._getTemplate(this._domTool.h),
      label = element.querySelector(".ui_boolean_ot_feature-label-content"),
      friendlyName = element.querySelector(
        ".ui_boolean_ot_feature-friendly_name",
      ),
      input = element.querySelector(".ui_boolean_ot_feature-input"),
      remove = element.querySelector(".ui_boolean_ot_feature-remove");

    label.textContent = tagName;
    input.addEventListener(
      "change",
      this._changeStateHandler(this._changeValueHandler.bind(this)),
    );
    remove.addEventListener(
      "click",
      this._changeStateHandler(this._deleteValueHandler.bind(this)),
    );

    this._insertElement(element);
    return [element, label, friendlyName, input];
  }
  _changeValueHandler() {
    this.getEntry("value").value = this._input.checked;
  }
  _deleteValueHandler() {
    const collectionPath = Path.fromString(
      this.widgetBus.getExternalName("value"),
    ).parent;
    this.getEntry(collectionPath).delete(this._tagName);
  }

  _setFont(font = null) {
    const tag = this._tagName,
      feature =
        font !== null && tag in font.features ? font.features[tag] : null,
      isInFontClass = "is-in-font";
    this._friendlyName.textContent = feature
      ? feature.bestName
      : OTFeatureInfo.all[tag].friendlyName;
    this.element.classList[feature ? "add" : "remove"](isInFontClass);

    const joiner = " – ",
      title = this.element.getAttribute("title").split(joiner);
    title.splice(
      1,
      title.length > 1 ? 1 : 0,
      feature ? "is in font" : "[is not in font]",
    );
    this.element.setAttribute("title", title.join(joiner));
  }

  update(changedMap) {
    // font = changedMap.get('font')
    // changedMap.get('value').value
    // ...
    if (changedMap.has("value")) {
      this._input.checked = changedMap.get("value").value;
      const tag = this._tagName,
        isDefaultValueClass = "is-default-value",
        isDefaultValue =
          OTFeatureInfo.all[tag].uiBoolean === this._input.checked,
        tooltip = isDefaultValue ? "is the default" : "*is not the default";
      this.element.classList[isDefaultValue ? "add" : "remove"](
        isDefaultValueClass,
      );
      this.element.setAttribute("title", tooltip);
    }
    let font = null;
    const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
    if (changedMap.has("rootFont") || requireUpdateDefaults) {
      if (requireUpdateDefaults) {
        const maybeFont = this._getDefaults(this._ppsRecord, "font", false);
        if (maybeFont) font = maybeFont;
      } else if (changedMap.has("rootFont"))
        font = changedMap.get("rootFont").value;
    }
    if (!font) {
      // rootFont can't (must not) be ForeignKey.NULL
      font = this.getEntry("rootFont").value;
    }
    this._setFont(font);
  }
}

class UIActiveOTFeatures extends _BaseDynamicMapContainerComponent {
  // important here, as we use the value of each entry in the path
  // of the stylePatchProperties@
  [HANDLE_CHANGED_AS_NEW] = true;
  constructor(
    widgetBus,
    _zones,
    ppsRecord,
    getDefaults,
    requireUpdateDefaults,
    updateDefaultsDependencies,
  ) {
    const contentElement = widgetBus.domTool.createElement("div", {
        class: "ui_ot_active_features",
      }),
      zones = new Map([..._zones, ["local", contentElement]]);
    super(widgetBus, zones);
    this._groups = new Map();
    this._insertElement(contentElement);
    this._ppsRecord = ppsRecord;
    this._getDefaults = getDefaults;
    this._requireUpdateDefaults = requireUpdateDefaults;
    this._updateDefaultsDependencies = updateDefaultsDependencies;
  }

  _getZone(tagName) {
    const tagInfo = OTFeatureInfo.all[tagName],
      zone = `group-${tagInfo.group}`,
      groupInfo = OTFeatureInfo.groups.get(tagInfo.group);
    if (!this._groups.has(zone)) {
      const h = this._domTool.h,
        classes = `ui_ot_active_features-group ui_ot_active_features-group_${tagInfo.group}`,
        zoneOuterElement = (
          <div class={classes}>
            <h4>{groupInfo.label}</h4>
            <div class="ui_ot_active_features-group-items"></div>
          </div>
        ),
        zoneInnerElement = zoneOuterElement.querySelector(
          ".ui_ot_active_features-group-items",
        );
      this._groups.set(zone, {
        inner: zoneInnerElement,
        outer: zoneOuterElement,
        info: groupInfo,
      });
    }
    const group = this._groups.get(zone);
    if (!this._zones.has(zone)) {
      this._zones.set(zone, group.inner);
      // Insert at corret position! Use: groupInfo.index!
      let before = null,
        after = null;
      for (const group_ of this._groups.values()) {
        if (group === group_) continue;
        if (group_.info.index <= group.info.index) {
          if (!before || before.info.index <= group_.info.index)
            before = group_;
        } else if (!before && group_.info.index > group.info.index) {
          if (!after || after.info.index > group_.info.index) after = group_;
        }
      }
      // FIXME: also remove again, after update, if still empty
      if (before) this._domTool.insertAfter(group.outer, before.outer);
      else if (after) this._domTool.insertBefore(group.outer, after.outer);
      else this._zones.get("local").append(group.outer);
    }
    return zone;
  }

  _cleanUpGroups() {
    for (const [zone, group] of this._groups) {
      if (group.inner.children.length === 0) {
        this._zones.delete(zone);
        group.outer.remove();
        this._groups.delete(zone);
      }
    }
  }

  _update(...args) {
    const result = super._update(...args);
    this._cleanUpGroups();
    return result;
  }

  /**
   * return => [settings, dependencyMappings, Constructor, ...args];
   */
  _getWidgetSetup(rootPath) {
    const [collection, tagName] = rootPath.parts.slice(-2),
      zone = this._getZone(tagName);
    return [
      {
        // rootPath: rootPath.parent,
        zone,
      },
      [
        [`./${collection}/${tagName}`, "value"],
        ["/font", "rootFont"],
        ...this._updateDefaultsDependencies,
      ],
      UIBooleanOTFeature,
      tagName,
      this._ppsRecord,
      this._getDefaults,
      this._requireUpdateDefaults,
    ];
  }
  _createWrapper(rootPath) {
    const childWidgetBus = this._childrenWidgetBus,
      // , args = [this._zones]
      [settings, dependencyMappings, Constructor, ...args] =
        this._getWidgetSetup(rootPath);
    return this._initWrapper(
      childWidgetBus,
      settings,
      dependencyMappings,
      Constructor,
      ...args,
    );
  }
}

export class UIOTFeaturesChooser extends _BaseContainerComponent {
  constructor(
    widgetBus,
    _zones,
    getDefaults,
    requireUpdateDefaults,
    updateDefaultsDependencies,
  ) {
    const h = widgetBus.domTool.h,
      localMain = <div class="ui_opentype_features_chooser"></div>,
      zones = new Map([..._zones, ["main", localMain]]),
      ppsRecordFont = ProcessedPropertiesSystemMap.createSimpleRecord(
        SPECIFIC,
        "font",
      );
    widgetBus.insertElement(localMain);
    super(widgetBus, zones, [
      [
        { zone: "main" },
        [],
        StaticNode,
        <h3 class="ui_opentype_features_chooser-label">OpenType Features</h3>,
      ],
      [
        { zone: "main" },
        [],
        StaticNode,
        <strong class="ui_generic_select-label">Add Feature</strong>,
      ],
      [
        { zone: "main" },
        [],
        StaticNode,
        <select
          class="ui_opentype_features_chooser-select_tags_filter"
          onChange={(e) => this._changeSelectFilter(e.target.value)}
        >
          <option selected value={UIOTFeaturesSetSelect.OPTION_FILTERS.IN_FONT}>
            Show tags in font
          </option>
          <option value={UIOTFeaturesSetSelect.OPTION_FILTERS.ALL}>
            Show all tags
          </option>
        </select>,
      ],
      [
        { zone: "main", id: "features-select" },
        [
          [widgetBus.getExternalName("rootFont"), "rootFont"],
          [widgetBus.getExternalName("openTypeFeatures"), "collection"],
          ...updateDefaultsDependencies,
        ],
        UIOTFeaturesSetSelect,
        "ui_opentype_features_chooser-select", // baseClass
        null,
        ppsRecordFont,
        [true, "Select a feature to add…"], // allowNull
        getDefaults,
        requireUpdateDefaults,
      ],
      [
        { zone: "main" },
        [],
        StaticNode,
        <button
          class="ui_opentype_features_chooser-add_feature"
          onClick={(e) => this._addFeatureHandler(e)}
        >
          Add Feature
        </button>,
      ],
      [
        {
          zone: "main",
        },
        [[widgetBus.getExternalName("openTypeFeatures"), "collection"]],
        UIActiveOTFeatures,
        zones,
        ppsRecordFont,
        getDefaults,
        requireUpdateDefaults,
        updateDefaultsDependencies,
      ],
    ]);
  }
  _changeSelectFilter(value) {
    this.getWidgetById("features-select").setOptionsFilter(value);
  }
  _addFeatureHandler(/*e*/) {
    const selectUI = this.getWidgetById("features-select"),
      tag = selectUI.value;
    if (tag === null) return;
    this._changeState(() => {
      const openTypeFeatures = this.getEntry("openTypeFeatures");
      if (openTypeFeatures.has(tag)) return;
      const value = openTypeFeatures.constructor.Model.createPrimalDraft(
        openTypeFeatures.dependencies,
      );
      value.value = OTFeatureInfo.all[tag].uiBoolean;
      openTypeFeatures.set(tag, value);
    });
  }
}
