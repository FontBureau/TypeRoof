export default {
  "extends": ["stylelint-config-standard"],
  "rules": {
    "no-descending-specificity": null,
    "selector-class-pattern": null,
    "no-duplicate-selectors": null, // it breaks clustering rules by topic
    "declaration-block-no-redundant-longhand-properties": null, // E.g.: Expected shorthand property "text-decoration": it's sometimes very helpful to allow being explicit and verbose!
  }
};
