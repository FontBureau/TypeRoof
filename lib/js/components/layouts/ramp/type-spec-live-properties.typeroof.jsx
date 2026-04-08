import { _BaseComponent } from "../../basics.mjs";
import { SPECIFIC } from "../../registered-properties-definitions.mjs";
import { HierarchicalScopeTypeSpecnion } from "./base-type-specnion.typeroof.jsx";

export class TypeSpecLiveProperties extends _BaseComponent {
    constructor(
        widgetBus,
        typeSpecPropertiesGenerators,
        isInheritingPropertyFn = null,
        typeSpecDefaultsMap = null,
    ) {
        super(widgetBus);
        this._propertiesGenerators = typeSpecPropertiesGenerators;
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
        // only used if also hasParentProperties
        this._isInheritingPropertyFn = isInheritingPropertyFn;
        if (this.hasParentProperties && typeSpecDefaultsMap !== null)
            throw new Error(
                `VALUE ERROR ${this} typeSpecDefaultsMap must be null if hasParentProperties.`,
            );
        else if (!this.hasParentProperties && typeSpecDefaultsMap === null)
            throw new Error(
                `VALUE ERROR ${this} typeSpecDefaultsMap must NOT be null if not hasParentProperties.`,
            );
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
    }

    get typeSpecnion() {
        if (this._typeSpecnion === null)
            throw new Error(
                "LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.",
            );
        return this._typeSpecnion;
    }

    get hasParentProperties() {
        return this.widgetBus.wrapper.dependencyReverseMapping.has(
            "@parentProperties",
        );
    }

    update(changedMap) {
        const hasRootFont =
            this.widgetBus.wrapper.dependencyReverseMapping.has("rootFont");
        let typeSpecnionChanged = false;

        if (
            changedMap.has("typeSpec") ||
            changedMap.has("@parentProperties") ||
            changedMap.has("rootFont")
        ) {
            const hasLocalChanges = changedMap.has("typeSpec"),
                fontChanged = changedMap.has("rootFont"),
                typeSpec_ = changedMap.has("typeSpec")
                    ? changedMap.get("typeSpec")
                    : this.getEntry("typeSpec"),
                // I had a case where typeSpec is a dynamic model
                // it would be nice to define the dependency in such a
                // way that it would be unwrapped here.
                typeSpec = typeSpec_.hasWrapped ? typeSpec_.wrapped : typeSpec_;
            if (this.hasParentProperties) {
                const parentProperties = changedMap.has("@parentProperties")
                        ? changedMap.get("@parentProperties")
                        : this.getEntry("@parentProperties"),
                    localChanged =
                        hasLocalChanges || this._typeSpecnion === null,
                    parentChanged =
                        this._typeSpecnion === null ||
                        parentProperties.typeSpecnion !==
                            this._typeSpecnion.parentTypeSpecnion;
                // Don't rebuild if the components haven't changed.
                if (localChanged || parentChanged || fontChanged) {
                    this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                        this._propertiesGenerators,
                        typeSpec,
                        parentProperties.typeSpecnion,
                        this._isInheritingPropertyFn,
                    );
                    typeSpecnionChanged = true;
                }
            } else {
                // typeSpecDefaultsMap only comes in at root, when
                // !this.hasParentProperties
                let typeSpecDefaultsMap = this._typeSpecDefaultsMap;
                // This is a hack, but it will work solidly for a while.
                // Eventually I'd like to figure a more conceptually robust way
                // how to distribute this kind of external, from the TypeSpec
                // structure, injected/inherited dynamic dependencies; or maybe
                // just formalize this.
                if (hasRootFont) {
                    const fontValue = (
                        changedMap.has("rootFont")
                            ? changedMap.get("rootFont")
                            : this.getEntry("rootFont")
                    ).value;
                    typeSpecDefaultsMap = new Map(this._typeSpecDefaultsMap);
                    typeSpecDefaultsMap.set(`${SPECIFIC}font`, fontValue);
                }

                this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                    this._propertiesGenerators,
                    typeSpec,
                    typeSpecDefaultsMap,
                    // potentiallly, here a local typespecnion with a typespec populated withh all the default values...
                );
                typeSpecnionChanged = true;
            }
        }
        if (typeSpecnionChanged) {
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `typeSpecProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    getPropertyValuesMap() {
        // returns  this._typeSpecnion._localPropertyValuesMap
        return this._typeSpecnion.getPropertyValuesMap();
    }
}
