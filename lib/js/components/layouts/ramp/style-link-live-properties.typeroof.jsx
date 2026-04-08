import { _BaseComponent } from "../../basics.mjs";

export class StyleLinkLiveProperties extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
    }

    get typeSpecnion() {
        if (this._typeSpecnion === null)
            throw new Error(
                "LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.",
            );
        return this._typeSpecnion;
    }

    update(changedMap) {
        // NOTE: stylePatchProperties@ is null initially
        // but it is not set if the link becomes invalid (which is IMO not
        // an initial update) the this function is called without 'stylePatchesSource@'
        // in the changedMap. FIXME: in that case the value changes from
        // a StylePatchSourceLiveProperties to null component, it would be
        // really good to have that in changedMap!
        // When it changes from null to a StylePatchSourceLiveProperties
        // it's in the changedMap!
        // This is only true if the linking is broken by changing the key in
        // stylePatchesSource. When setting a broken link in stylePatchLinksMap
        // null is reported each time. This is likely because that triggers
        // an initial update.
        // We could add a dependency to stylePatchesSource for an additional
        // hint.
        //
        // eventually, if we update styleLinkProperties@ regardless,
        // each time this method is called, it doesn't matter so much.

        // A StylePatchSourceLiveProperties
        const stylePatchProperties = changedMap.has("stylePatchProperties@")
                ? changedMap.get("stylePatchProperties@")
                : this.getEntry("stylePatchProperties@"),
            // A TypeSpecLiveProperties
            typeSpecProperties = changedMap.has("typeSpecProperties@")
                ? changedMap.get("typeSpecProperties@")
                : this.getEntry("typeSpecProperties@"),
            stylePatchPropertyValuesMap =
                stylePatchProperties !== null
                    ? stylePatchProperties.propertyValuesMap
                    : new Map(),
            // NOTE stylePatchPropertyValuesMap.size can be 0 even if it
            // comes from stylePatchProperties.propertyValuesMap. The
            // default behavior of a style patch is to set nothing.
            newTypeSpecnion =
                stylePatchPropertyValuesMap.size !== 0
                    ? typeSpecProperties.typeSpecnion.createPatched(
                          stylePatchProperties.propertyValuesMap,
                      )
                    : typeSpecProperties.typeSpecnion;
        if (this._typeSpecnion !== newTypeSpecnion) {
            // console.log(`styleLinkProperties@ ${this.widgetBus.rootPath} new typeSpecnion`, newTypeSpecnion, this);
            this._typeSpecnion = newTypeSpecnion;
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `styleLinkProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    getPropertyValuesMap() {
        return this._typeSpecnion.getPropertyValuesMap();
    }
}
