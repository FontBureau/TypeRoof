export class ProseMirrorGeneralDocumentStyler extends _BaseComponent {
    update(changedMap) {
        const element = this.widgetBus.getWidgetById("proseMirror").element;
        const propertyValuesMap = (
            changedMap.has("properties@")
                ? changedMap.get("properties@")
                : this.getEntry("properties@")
        ).typeSpecnion.getProperties();

        if (changedMap.has("properties@")) {
            const outerColorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "background-color"],
                ],
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                };
            actorApplyCSSColors(
                element,
                propertyValuesMap,
                getDefault,
                outerColorPropertiesMap,
            );
            setLanguageTag(element, propertyValuesMap);
            // NOTE: apply paddings (use padding instead of margins)
            // especially left and top, but ideally also right and bottom
            // This is because we don't apply styles directly to the actual
            // document element, but rather to the parent of that. (.prosemirror-host)
            // i.e the element in here is a lot like the outerElement.
            //
            // NOTE: it could be worth to try to treat the actual .ProseMirror
            // document like the innerElement.
        }
    }
}
