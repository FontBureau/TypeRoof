import { _BaseTreeEditor } from "./base-tree-editor.typeroof.jsx";
import { TypeSpecModel } from "../../type-spec-models.mjs";
import { Path } from "../../../metamodel.mjs";

export class TypeSpecTreeEditor extends _BaseTreeEditor {
    _isContainerItem(item) {
        //return getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE;
        return item instanceof TypeSpecModel;
    }
    _getContainerRelPathToChildren() {
        // return Path.fromParts('instance', 'activeActors');
        return Path.fromParts("children");
    }
    _getItemLabel(item) {
        // const actorTypeModel = actor.get('actorTypeModel')
        //   , typeLabel = actorTypeModel.get('label').value
        //   , actorLabel = actor.get('instance').get('label').value
        //   ;
        // //  , typeClass = actorTypeModel.get('typeClass').value
        // return actorLabel ? `${typeLabel}: ${actorLabel}` : typeLabel;
        const typeLabel = "TypeSpec",
            itemLabel = item.get("label").value;
        return itemLabel ? `${typeLabel}: ${itemLabel}` : typeLabel;
    }

    _createItem(typeKey, dependencies) {
        if (typeKey !== "TypeSpec")
            throw new Error(
                `VALUE ERROR don't know how to create item for typeKey: "${typeKey}"`,
            );
        return TypeSpecModel.createPrimalDraft(dependencies);
    }
}
