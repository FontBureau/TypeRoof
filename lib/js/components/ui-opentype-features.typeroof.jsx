import { _BaseComponent, _BaseContainerComponent } from "./basics.mjs";

import { GenericSelect, StaticNode } from "./generic.mjs";

import { OTFeatureInfo } from "../ot-feature-info.mjs";

// TODO: we need a Model
// It's likely a map: [featureTag]=>[FeatureSetting] and for most cases
// FeatureSetting is a Boolean.Need to look at specific casses (AALT/ Access all Alternates)???

function getFeatureInfo(font = null, featuresInfo = OTFeatureInfo.ui) {
  const fontFeatures = new Map(),
    _getNewFeature = (otFeatureTag) => ({
      tables: new Set(),
      langSys: new Set(),
      info: featuresInfo[otFeatureTag],
      uiName: null,
      inFont: false,
    }),
    _setFeaturesFromFont = (
      tableTag,
      tableFeatures,
      langSys,
      featureIndexes,
    ) => {
      for (const idx of featureIndexes) {
        const { tag: otFeatureTag, feature } = tableFeatures[idx];
        if (!fontFeatures.has(otFeatureTag)) continue;
        const featureData = fontFeatures.get(otFeatureTag);
        featureData.inFont = true;
        featureData.tables.add(tableTag);
        featureData.langSys.add(langSys);
        if (
          (featureData.uiName === null && otFeatureTag.startsWith("ss")) ||
          otFeatureTag.startsWith("cv")
        ) {
          featureData.uiName = _getUINameFromFeature(feature, null);
        }
      }
    };
  // This reproduces the order in OTFeatureInfo.
  for (const otFeatureTag of Object.keys(featuresInfo))
    fontFeatures.set(otFeatureTag, _getNewFeature(otFeatureTag));

  if (!font) return fontFeatures;

  const otjsFontObject = font.fontObject;
  for (const tableTag of ["GSUB", "GPOS"]) {
    const openTypeJSTableTag = tableTag.toLowerCase();
    if (
      !(openTypeJSTableTag in otjsFontObject.tables) ||
      !otjsFontObject.tables[openTypeJSTableTag].scripts
    )
      continue;
    const table = otjsFontObject.tables[openTypeJSTableTag],
      scripts = table.scripts;
    for (const scriptEntry of scripts) {
      const script = scriptEntry.script,
        scriptTag = scriptEntry.tag;
      if (script.defaultLangSys) {
        const langTag = "Default",
          langSys = script.defaultLangSys;
        _setFeaturesFromFont(
          tableTag,
          table.features,
          [scriptTag, langTag].join(":"),
          langSys.featureIndexes,
        );
      }
      if (script.langSysRecords) {
        for (const { tag: langTag, langSys } of script.langSysRecords) {
          _setFeaturesFromFont(
            tableTag,
            table.features,
            [scriptTag, langTag].join(":"),
            langSys.featureIndexes,
          );
        }
      }
      continue;
    }
  }
  return fontFeatures;
}

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
  }

  /* Override via constructor. */
  _optionGetLabel(key, value) {
    // const tagInfo = OTFeatureInfo.all[key];
    // value === tagInfo
    if (typeof value === "string")
      // for the null/placeholder option
      return value;
    return value.inFont
      ? `${key} – ${value.uiName || value.info.friendlyName}`
      : `[${key}] – ${value.uiName || value.info.friendlyName}`;
  }

  _optionGetGroup(value) {
    // return [groupKey, label, index];
    if (value === null)
      // for the null/placeholder option
      return super._optionGetGroup();
    const group = OTFeatureInfo.groups.get(value.info.group);
    if (!group) throw new Error(`KEY ERROR group "${value.group}" not found`);
    return [value.info.group, group.label, group.index];
  }

  _getFeatures() {
    if (!this._featuesCache || this._featuesCache.font !== this._font) {
      this._featuesCache = {
        font: this._font,
        features: getFeatureInfo(this._font),
      };
    }
    return this._featuesCache.features;
  }

  *_optionsGen(/*font*/) {
    yield* this._getFeatures();
  }

  async _changeSelectedValueHandler(/*event*/) {
    // this version doesn't use a 'value' dependency
    if (this._onChangeFn) this._onChangeFn(this.value);
  }

  _getIsHiddenFn() {
    if (this._optionsFilter === this.constructor.OPTION_FILTERS.IN_FONT) {
      const features = this._getFeatures();
      return (value) => {
        return features.has(value) ? !features.get(value).inFont : false;
      };
    } else if (this._optionsFilter === this.constructor.OPTION_FILTERS.ALL)
      return null;
    throw new Error(
      `NOT IMPLEMENTED for optionsFilter: "${this._optionsFilter}" known values: ${Object.values(this.constructor.OPTION_FILTERS).join(", ")}`,
    );
  }

  update(changedMap) {
    console.log(`${this}.update changedMap:`, ...changedMap.keys());
    // if(changed.has('options'))
    //     this._updateOptions(changed.get('options'));
    // if(changed.has('value'))
    //     this._updateValue(changed.get('value'));
    if (changedMap.has("rootFont") || changedMap.has("properties@")) {
      const propertyValuesMap = (
          changedMap.has("properties@")
            ? changedMap.get("properties@")
            : this.getEntry("properties@")
        ).typeSpecnion.getProperties(),
        font = propertyValuesMap.has(this._ppsRecord.fullKey)
          ? propertyValuesMap.get(this._ppsRecord.fullKey)
          : // rootFont can't be ForeignKey.NULL
            this.getEntry("rootFont").value;
      this._updateOptions(font);
    }
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
    super._updateOptions(font, ...args);
    if (this._select.selectedIndex === -1) {
      this._select.options[0].selected = true;
    }
    this._isHiddenFn = this._getIsHiddenFn();
    this._updateRestrictions();
    console.log(`${this}`, this);
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

  //_updateOptions(availableOptions=null) {
  //    //super._updateOptions(availableOptions);
  //
  //    // If selected value is no longer in options.
  //    // if(availableOptions !== null && this._select.selectedIndex === -1) {
  //    //     // select first option
  //    //     this._select.options[0].selected = true;
  //    //     // trigger change
  //    //     // CAN'T DO THIS as this is within a change cycle
  //    //     //but in this special case we can call directly...
  //    //     this._changeSelectedValueHandler();
  //    // }
  //}
}

function _setsEqual(setA, setB) {
  if (setA === setB) {
    return true;
  }
  if (setA.size !== setB.size) {
    return false;
  }
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

// FIXME should be included in the fontObject
function _getUINameFromFeature(feature, defaultVal) {
  const uiLabelNameEntry = feature.uiName || feature.featUiLabelName || {};
  for (const platform of [
    "unicode",
    "windows",
    "macintosh",
    ...Object.keys(uiLabelNameEntry),
  ]) {
    if (!(platform in uiLabelNameEntry)) continue;
    const platformEntry = uiLabelNameEntry[platform];
    for (const lang of ["en", ...Object.keys(platformEntry)]) {
      if (lang in platformEntry) return platformEntry[lang];
    }
  }
  if (defaultVal !== undefined) return defaultVal;
  throw new Error(`KEY ERROR can't find UI-Name in feature`);
}

export class UIActiveOTFeatures extends _BaseComponent {
  constructor(widgetBus, ppsRecord) {
    super(widgetBus);
    this._ppsRecord = ppsRecord;
    this._featureInputToInfo = null;
    this._features = new Map();
    this._nonDefaultFeatures = new Set();
    [this.container, this._childrenContainer, this._currentFontLabel] =
      this._initTemplate();
  }

  _getTemplate(h) {
    return (
      <div class="ot_features_chooser">
        <span class="ot_features_chooser-current_font">(not set)</span>
        <div class="ot_features_chooser-children_container"></div>
      </div>
    );
  }

  _initTemplate() {
    const container = this._getTemplate(this._domTool.h),
      current_font = container.querySelector(
        ".ot_features_chooser-current_font",
      ),
      childrenContainer = container.querySelector(
        ".ot_features_chooser-children_container",
      );
    this._insertElement(container);
    childrenContainer.addEventListener("change", (e) => {
      this._onFeatureChange(e.target);
    });
    return [container, childrenContainer, current_font];
  }

  _setLabelState() {
    this.container.classList[this._nonDefaultFeatures.size ? "add" : "remove"](
      "non_default",
    );
  }

  _setInputState(tag) {
    const { input } = this._features.get(tag);
    if (!input) return;
    input.checked = this._isChecked(tag);
    const isDefault = this.constructor.getUIDefault(tag) === input.checked;
    input.parentElement.classList[isDefault ? "remove" : "add"]("non_default");
  }

  _setValue(newTagsArray) {
    // => boolean changed
    const newTags = new Set(newTagsArray),
      oldTags = this._nonDefaultFeatures;
    if (this._features.size) {
      // We can set a value before _features are known, but when
      // features are known, value must be compatible.
      for (const tag of newTags) {
        if (!this._features.has(tag)) newTags.delete(tag);
      }
    }

    this._nonDefaultFeatures = newTags;
    const changed = !_setsEqual(oldTags, this._nonDefaultFeatures); // => bool changed

    if (changed) {
      for (const tag of this._features.keys()) {
        this._setInputState(tag);
      }
      this._setLabelState();
    }
    return changed;
  }

  // Basically this._inputs[0].value is the model state location.
  get value() {
    return [...this._nonDefaultFeatures];
  }
  set value(val) {
    this._setValue(val);
  }

  // FIXME:!!!
  _onFeatureChange(featureInputElement) {
    const tag = this._featureInputToTag.get(featureInputElement),
      defaultChecked = this.constructor.getUIDefault(tag),
      isDefault = defaultChecked === featureInputElement.checked;
    if (!isDefault) this._nonDefaultFeatures.add(tag);
    else this._nonDefaultFeatures.delete(tag);

    this._setInputState(tag);
    this._setLabelState();
  }

  static getUIDefault(tag) {
    return tag in OTFeatureInfo.all ? OTFeatureInfo.all[tag].uiBoolean : null;
  }

  static isChecked(tag, isDefault) {
    const defaultChecked = this.getUIDefault(tag);
    return isDefault ? defaultChecked : !defaultChecked;
  }

  _isChecked(tag) {
    return this.constructor.isChecked(tag, !this._nonDefaultFeatures.has(tag));
  }

  _makeOptions(features) {
    this._domTool.clear(this._childrenContainer);
    this._featureInputToTag = new Map();
    this._features.clear();
    const tags = [...features.keys()].sort(),
      h = this._domTool.h,
      groups = new Map(),
      getGroup = (groupName) => {
        if (groups.has(groupName)) return groups.get(groupName)[1];
        const info = OTFeatureInfo.groups.get(groupName),
          elem = (
            <div class="ot_features_chooser-group {`ot_features_chooser-group-{groupName.toLowerCase()}`}">
              <strong>{info.label}</strong>
              <div class="ot_features_chooser-group-items"></div>
            </div>
          ),
          itemsElem = elem.querySelector(".ot_features_chooser-group-items");
        groups.set(groupName, [elem, itemsElem]);
        return itemsElem;
      };

    for (const tag of tags) {
      const feature = features.get(tag),
        { uiBoolean: defaultChecked, friendlyName } = feature.info,
        fontUIName = feature.uiName;
      if (defaultChecked === null) {
        // These features usually don't work with a simple on/off
        // user interface and need to be treated differently.
        continue;
      }

      const defaultSetting = defaultChecked ? "on" : "off",
        info = `"${tag} (tables: ${[...feature.tables].join(", ")}): ${fontUIName || friendlyName}; default: ${defaultSetting}"`,
        tagString = tag,
        tagItem = feature.tables.size ? (
          // tag is in current font
          <strong>{tagString}</strong>
        ) : (
          // tag is not in font
          `[${tagString}]`
        ),
        elem = (
          <label title={info}>
            <input type="checkbox" value={tag} /> {tagItem}{" "}
            {fontUIName || friendlyName}
          </label>
        ),
        input = elem.querySelector("input");
      this._featureInputToTag.set(input, tag);
      this._features.set(tag, { input });
      this._setInputState(tag);

      getGroup(feature.info.group).append(elem, <br />);
    }

    // keep order of the groups
    for (const groupName of OTFeatureInfo.groups.keys()) {
      if (groups.has(groupName))
        this._childrenContainer.append(groups.get(groupName)[0]);
    }
    this._setLabelState();
  }

  getFeatures(font) {
    const otjsFontObject = font.fontObject,
      fontFeatures = new Map(),
      _getFeatures = (tableTag, tableFeatures, langSys, featureIndexes) => {
        for (const idx of featureIndexes) {
          const { tag: otFeatureTag, feature } = tableFeatures[idx];
          if (!fontFeatures.has(otFeatureTag)) {
            fontFeatures.set(otFeatureTag, {
              tables: new Set(),
              langSys: new Set(),
              info: OTFeatureInfo.all[otFeatureTag],
              uiName: null,
            });
          }
          const featureData = fontFeatures.get(otFeatureTag);
          featureData.tables.add(tableTag);
          featureData.langSys.add(langSys);
          if (
            (featureData.uiName === null && otFeatureTag.startsWith("ss")) ||
            otFeatureTag.startsWith("cv")
          ) {
            featureData.uiName = _getUINameFromFeature(feature, null);
          }
        }
      };
    for (const [otFeatureTag, info] of Object.entries(OTFeatureInfo.all)) {
      fontFeatures.set(otFeatureTag, {
        tables: new Set(),
        langSys: new Set(),
        info: info,
        uiName: null,
      });
    }
    for (const tableTag of ["GSUB", "GPOS"]) {
      const openTypeJSTableTag = tableTag.toLowerCase();
      if (
        !(openTypeJSTableTag in otjsFontObject.tables) ||
        !otjsFontObject.tables[openTypeJSTableTag].scripts
      )
        continue;
      const table = otjsFontObject.tables[openTypeJSTableTag],
        scripts = table.scripts;
      for (const scriptEntry of scripts) {
        const script = scriptEntry.script,
          scriptTag = scriptEntry.tag;
        if (script.defaultLangSys) {
          const langTag = "Default",
            langSys = script.defaultLangSys;
          _getFeatures(
            tableTag,
            table.features,
            [scriptTag, langTag].join(":"),
            langSys.featureIndexes,
          );
        }
        if (script.langSysRecords) {
          for (const { tag: langTag, langSys } of script.langSysRecords) {
            _getFeatures(
              tableTag,
              table.features,
              [scriptTag, langTag].join(":"),
              langSys.featureIndexes,
            );
          }
        }
        continue;
      }
    }
    return fontFeatures;
  }

  setFont(font) {
    const features = this.getFeatures(font);
    this._makeOptions(features);

    // clean up the actual value
    for (const feaureTag of this._nonDefaultFeatures) {
      if (!this._features.has(feaureTag))
        this._nonDefaultFeatures.delete(feaureTag);
    }
  }

  update(changedMap) {
    console.log(`${this}.update changedMap:`, ...changedMap);
    if (changedMap.has("rootFont") || changedMap.has("properties@")) {
      const propertyValuesMap = (
          changedMap.has("properties@")
            ? changedMap.get("properties@")
            : this.getEntry("properties@")
        ).typeSpecnion.getProperties(),
        font = propertyValuesMap.has(this._ppsRecord.fullKey)
          ? propertyValuesMap.get(this._ppsRecord.fullKey)
          : // rootFont can't be ForeignKey.NULL
            this.getEntry("rootFont").value;

      console.log(
        `${this} propertyValuesMap.keys():`,
        ...propertyValuesMap.keys(),
        "\n    font:",
        font,
      );
      // FIXME: used to be defined as:
      // const inherited = // this.getEntry("font") === ForeignKey.NULL;
      this._currentFontLabel.textContent = `${font.fullName}`;
      this.setFont(font);
    }
  }

  // static applyFeatures(container, nonDefaultTags) {
  //     const features = [];
  //     for(const featureTag of new Set(nonDefaultTags)) {
  //         const checked = this.isChecked(featureTag, false/* here all are non-default */);
  //         features.push(`"${featureTag}" ${checked ? 'on' : 'off'}`);
  //     }
  //     if(features.length)
  //         container.style.setProperty('font-feature-settings', features.join(', '));
  //     else
  //         container.style.removeProperty('font-feature-settings');
  // }
  //
  // applyFeatures(container) {
  //     this.constructor.applyFeatures(container, this._nonDefaultFeatures);
  // }
}

export class UIOTFeaturesChooser extends _BaseContainerComponent {
  constructor(widgetBus, _zones, ppsRecordFont) {
    const h = widgetBus.domTool.h,
      localMain = <div class="ui_opentype_features_chooser"></div>,
      zones = new Map([..._zones, ["main", localMain]]);
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
          [widgetBus.getExternalName("properties@"), "properties@"],
        ],
        UIOTFeaturesSetSelect,
        "ui_opentype_features_chooser-select", // baseClass
        null,
        ppsRecordFont,
        [true, "Select a feature to add…"], // allowNull
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
        [
          [widgetBus.getExternalName("rootFont"), "rootFont"],
          [widgetBus.getExternalName("properties@"), "properties@"],
        ],
        UIActiveOTFeatures,
        ppsRecordFont,
      ],
    ]);
  }
  _changeSelectFilter(value) {
    this.getWidgetById("features-select").setOptionsFilter(value);
  }
  _addFeatureHandler(/*e*/) {
    const selectUI = this.getWidgetById("features-select"),
      value = selectUI.value;
    console.log(`${this}._addFeatureHandler value:`, value);
  }
}
