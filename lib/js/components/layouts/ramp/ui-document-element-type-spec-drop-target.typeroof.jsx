import { _BaseDropTarget } from "../../generic.mjs";

export class UIDocumentElementTypeSpecDropTarget extends _BaseDropTarget {
    static BASE_CLASS = "ui_document_element_typespec";

    constructor(widgetBus, applicableTypes, element) {
        super(
            widgetBus,
            null /*effectLabel*/,
            null /*effectLabel*/,
            applicableTypes,
        );
        this._addEventListeners(element);
        this.element = element;
    }

    initTemplate() {
        /*pass*/
        return [];
    }

    _dropHandlerImplementation(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        return this._changeState(() => {
            const typeSpecLink = this.getEntry("typeSpecLink");
            typeSpecLink.value = event.dataTransfer.getData(type);
            // if anything needs to change immediately, here would be
            // a chance to invoke a callback. OR, maybe, a CoherenceFunction
        });
    }
}
