import {
    CoherenceFunction,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../../../metamodel.mjs";
import {
    StylePatchesMapModel,
    StylePatchLinksMapModel,
} from "../../type-spec-models.mjs";

const _SERIALIZE_OPTIONS = Object.assign({}, SERIALIZE_OPTIONS, {
    format: SERIALIZE_FORMAT_OBJECT,
});

/**
 * Depth first iteration over the root TypeSpec and all of its (recursive)
 * children.
 */
function* _iterTypeSpecs(typeSpec) {
    yield typeSpec;
    for (const [, child] of typeSpec.get("children").entries())
        yield* _iterTypeSpecs(child);
}

/**
 * Replace the complete contents of an ordered map (`target`) with the
 * entries of `newMap`.
 */
function _replaceOrderedMap(target, newMap) {
    // NOTE: the public "splice" addresses entries by key, "arraySplice"
    // by index — here we want to drop all existing entries by index.
    if (target.size) target.arraySplice(0, target.size);
    for (const [key, entry] of newMap.entries()) target.set(key, entry);
}

/**
 * An "observer" implemented as a CoherenceFunction, reacting to changes
 * of the root font (the "font" dependency).
 *
 * Whenever the root font changes it (re)generates all "style patches" —
 * one SimpleStylePatch per named instance of the font — into
 * `stylePatchesSource`, and associates those patches with every existing
 * TypeSpec (the root TypeSpec and all of its children).
 *
 * NOTE: a CoherenceFunction is the idiomatic way to react to model
 * changes here, as changeState (and hence writing the model from a
 * component's update phase) is locked while the UI updates.
 *
 * The font identity for which the patches were generated is stored in
 * `rootFontStylePatchesKey`. As coherence functions run on (almost)
 * every metamorphose, this lets us rebuild only when the font actually
 * changed — and otherwise leave the user's edits to the patches and
 * links untouched.
 */
export function createRootFontStylePatchesCoherenceFunction() {
    return CoherenceFunction.create(
        [
            // Ensures this runs after the default-state initialization,
            // as both write "typeSpec" and "stylePatchesSource".
            "initTypeSpec",
            "font",
            "typeSpec",
            "stylePatchesSource",
            "rootFontStylePatchesKey",
        ],
        function generateRootFontStylePatches({
            font,
            typeSpec,
            stylePatchesSource,
            rootFontStylePatchesKey,
        }) {
            // "font" is a ForeignKey/ValueLink that can be null and its
            // value is the actual (VideoProof-)font.
            const fontObject = font ? font.value : null;
            if (!fontObject) return;

            const signature = fontObject.fullName;
            if (rootFontStylePatchesKey.value === signature)
                // The style patches already correspond to this font, don't
                // regenerate (and don't clobber the user's edits).
                return;

            // [[name, coordinates {axisTag: numericValue}], ...]
            const instances = fontObject.instances;

            // (Re)generate the style patches, one SimpleStylePatch per
            // named instance of the font. The instance name is normalized to
            // lower case so the keys match the (lower case) style names used
            // e.g. in the editor/document (e.g. "bold", "bold italic").
            const stylePatchesData = instances.map(([name, coordinates]) => [
                name.toLowerCase(),
                {
                    stylePatchTypeKey: "SimpleStylePatch",
                    instance: {
                        axesLocations: Object.entries(coordinates).map(
                            ([axisTag, numericValue]) => [
                                axisTag,
                                { logicalValue: "number", numericValue },
                            ],
                        ),
                    },
                },
            ]);
            _replaceOrderedMap(
                stylePatchesSource,
                deserializeSync(
                    StylePatchesMapModel,
                    stylePatchesSource.dependencies,
                    stylePatchesData,
                    _SERIALIZE_OPTIONS,
                ),
            );

            // Associate the generated style patches with every TypeSpec.
            // Keys are the local names in the TypeSpec, values are the keys
            // into stylePatchesSource; here both are the instance name.
            const stylePatchLinksData = instances.map(([name]) => {
                const key = name.toLowerCase();
                return [key, key];
            });
            // Materialize the traversal before mutating, to keep traversal
            // and (nested draft) mutation cleanly separated.
            for (const typeSpecItem of [..._iterTypeSpecs(typeSpec)]) {
                const stylePatches = typeSpecItem.get("stylePatches");
                _replaceOrderedMap(
                    stylePatches,
                    deserializeSync(
                        StylePatchLinksMapModel,
                        stylePatches.dependencies,
                        stylePatchLinksData,
                        _SERIALIZE_OPTIONS,
                    ),
                );
            }

            rootFontStylePatchesKey.value = signature;
        },
    );
}
