// Generators yield [propertyName, propertyValue] pairs or triples
// [propertyName, propertyValue, demarcation]. The demarcation routes the
// entry: DEMARCATION_PROPERTY (the default) adds it to the local scope,
// DEMARCATION_INHERITANCE adds it to the inheritance controls, which
// determine what this scope passes on to its children (see
// HierarchicalScopeTypeSpecnion.getInheritableProperties).
export const DEMARCATION_PROPERTY = Symbol("DEMARCATION_PROPERTY"),
    DEMARCATION_INHERITANCE = Symbol("DEMARCATION_INHERITANCE"),
    // As the value of an inheritance control: withhold the property from
    // the inheritable properties, even if it exists in this scope.
    TOMBSTONE = Symbol("TOMBSTONE");

// Compatibility re-exports: the scope-generic machinery lives in
// scope-resolution.mjs; these aliases keep existing imports stable.
export {
    mapSetProperties,
    collectPropertyGeneratorEntries,
    _BaseScopeProperties as _BaseTypeSpecnion,
    LocalScopeProperties as LocalScopeTypeSpecnion,
    PatchedScopeProperties as PatchedTypeSpecnion,
    HierarchicalScopeProperties,
    HierarchicalScopeProperties as HierarchicalScopeTypeSpecnion,
} from "./scope-resolution.mjs";
