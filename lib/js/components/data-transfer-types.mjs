
export const DATA_TRANSFER_TYPES = Object.freeze({
    ACTOR_PATH: 'application/x.typeroof-actor-path'
  , ACTOR_CREATE: 'application/x.typeroof-actor-create'
    // These are "atomic" AXESMATH items, "Sum", "Product", and "Location"
  , AXESMATH_ITEM_PATH: 'application/x.typeroof-axesmath-item-path'
  , AXESMATH_ITEM_CREATE: 'application/x.typeroof-axesmath-item-create'
    // A location value lives in a Location or in a LocationValues list
    // Within the LocationValues list it must be possible to reorder the individual locationValues.
  , AXESMATH_LOCATION_VALUE_PATH: 'application/x.typeroof-axesmath-location-value-path'
  , AXESMATH_LOCATION_VALUE_CREATE: 'application/x.typeroof-axesmath-location-value-create'
  , AXESMATH_LOCATION_KEY_PATH: 'application/x.typeroof-axesmath-location-key-path'
  , AXESMATH_LOCATION_VALUES_KEY_PATH: 'application/x.typeroof-axesmath-location-values-key-path'
    //
  , TYPE_SPEC_TYPE_SPEC_PATH: 'application/x.typeroof-typespec-type-spec-path'
  , TYPE_SPEC_TYPE_SPEC_CREATE: 'application/x.typeroof-typespec-type-spec-create'
  , TYPE_SPEC_STYLE_PATCH_PATH:'application/x.typeroof-typespec-style-patch-path'
  , TYPE_SPEC_STYLE_PATCH_CREATE:'application/x.typeroof-typespec-style-patch-create'
  , TYPE_SPEC_STYLE_PATCH_LINK_PATH:'application/x.typeroof-typespec-style-patch-link-path'
  // , TYPE_SPEC_STYLE_PATCH_LINK_CREATE:'application/x.typeroof-typespec-style-patch-link-create'
    //
  , TYPE_SPEC_DOCUMENT_NODE_PATH: 'application/x.typeroof-typespec-document-node-path'
  , TYPE_SPEC_DOCUMENT_NODE_CREATE: 'application/x.typeroof-typespec-document-node-create'
});
