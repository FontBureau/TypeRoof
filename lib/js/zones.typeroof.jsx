function createDefaultZonesDOM(h) {
    const wrapper = (
        <div class="wrapper">
            <div class="typeroof-ui_sidebar">
                <aside class="typeroof-ui typeroof-ui_main"></aside>
                <aside class="typeroof-ui typeroof-ui_main-after"></aside>
            </div>
            <div class="typeroof-main">
                <div class="typeroof-layout-before"></div>
                <div class="typeroof-layout"></div>
                <div class="typeroof-layout-after"></div>
            </div>
        </div>
    );
    return wrapper;
}

export function getZones(wrapperElement) {
    const zones = new Map(
        [
            ["main", ".typeroof-ui_main"],
            ["after-main", ".typeroof-ui_main-after"],
            ["before-layout", ".typeroof-layout-before"],
            ["layout", ".typeroof-layout"],
            ["after-layout", ".typeroof-layout-after"],
        ].map(([name, selector]) => [
            name,
            wrapperElement.querySelector(selector),
        ]),
    );
    zones.set("wrapper", wrapperElement);
    return zones;
}

export function createAndGetDefaultZones(h, appendTo = null) {
    const wrapper = createDefaultZonesDOM(h),
        zones = getZones(wrapper);
    if (appendTo !== null) appendTo.append(wrapper);
    return zones;
}
