/**
 * Small DOM wiring helpers shared by otherwise independent widget
 * subsystems in this folder. This is a leaf module: it imports nothing
 * from its siblings, so both the map and the list UI can use it without
 * knowing about each other.
 */

export function _setClassesHelperMethod(requireClasses) {
    const baseClasses =  [...this.constructor.BASE_CLASSES, this.constructor.ROOT_CLASS];
    if(this._getInstanceBaseClasses)
        baseClasses.push(...this._getInstanceBaseClasses());
    if(this.constructor.ROOT_CLASS !== this.BASE_CLASS && this.BASE_CLASS)
        baseClasses.push(this.BASE_CLASS);
    for(const baseClass of baseClasses) {
        for(const [element, ...classParts] of requireClasses)
            element.classList.add([baseClass, ...classParts].join('-'));
    }
}

export function connectLabelWithInput(widgetBus, labelElement, inputElement) {
    if(!labelElement || !inputElement)
        return false
    const idRegistry = widgetBus.getWidgetById("dom-global-id-registry", null);
    if(!idRegistry)
        return false;
    const uniqueId = idRegistry.generateUniqueId();
    labelElement.setAttribute('for', uniqueId);
    inputElement.id = uniqueId;
    return true;
}

export function setupTooltip(element) {
    const trigger = element.querySelector(".ui_tooltip_trigger");
    if (!trigger) return;

    const tooltip = element.querySelector(".ui_tooltip");
    const showTooltip = () => {
        tooltip.showPopover({ source: trigger });
    };
    const hideTooltip = () => {
        tooltip.hidePopover();
    };
    trigger.addEventListener("mouseover", showTooltip);
    trigger.addEventListener("mouseout", hideTooltip);
    trigger.addEventListener("focus", showTooltip);
    trigger.addEventListener("blur", hideTooltip);
}
