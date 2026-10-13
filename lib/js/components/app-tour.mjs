/**
 * A short first-visit tour through the shell UI. It only anchors on
 * elements that exist for every layout (see zones.typeroof.jsx, main-ui.mjs
 * and app-menu.typeroof.jsx), so it works for whichever layout is active.
 */

const TOUR_STORAGE_KEY = "typeroof-tour",
    TOUR_COOKIE = "typeroof-tour=viewed",
    TOUR_VIEWED = "viewed";

/**
 * A step without selector is shown as a centered dialog. side is the
 * popover position relative to the element (driver.js default: bottom).
 * title and description are HTML.
 */
export const TOUR_STEPS = Object.freeze([
    {
        title: "Welcome to TypeRoof!",
        description:
            "TypeRoof helps type designers and font users explore the design "
            + "space of <a href='https://medium.com/variable-fonts/https-medium-com-tiro-introducing-opentype-variable-fonts-12ba6cd2369'>OpenType variable fonts</a> "
            + "across a range of proofing layouts.",
    },
    {
        selector: ".ui_layout_select",
        title: "Layouts",
        description:
            "Choose a layout. Each layout is a different proofing tool.",
    },
    {
        selector: ".ui_font-select",
        title: "Fonts",
        description:
            "Choose from a selection of open-source fonts, or load your own "
            + "TTF, OTF, WOFF, or WOFF2 files via <b>File › Manage "
            + "fonts…</b>",
    },
    {
        selector: ".typeroof-ui_sidebar",
        title: "Sidebar",
        description:
            "Adjust the active layout's settings here, including playback "
            + "controls for animated layouts. At the bottom, you can add "
            + "comments to the proof.",
    },
    {
        selector: ".typeroof-main",
        title: "Proof",
        description:
            "This is where you inspect the proof of your selected font, "
            + "rendered by the active layout.",
    },
    {
        selector: ".typeroof-app-menu",
        title: "Menu",
        description:
            "<b>File</b>: load and save your work, copy a share link, or "
            + "reset to defaults. <b>Help</b>: read the documentation or "
            + "choose <b>Take the tour</b> to replay this tour.",
    },
]);

export function hasViewedTour(window) {
    try {
        return window.localStorage.getItem(TOUR_STORAGE_KEY) === TOUR_VIEWED;
    } catch {
        // localStorage can be blocked by security settings.
        return window.document.cookie.includes(TOUR_COOKIE);
    }
}

export function setTourViewed(window) {
    try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, TOUR_VIEWED);
    } catch {
        window.document.cookie = `${TOUR_COOKIE};max-age=31536000;path=/`;
    }
}

/**
 * Resolve TOUR_STEPS into driver.js steps for document. A missing
 * element resolves to null, which driver.js shows as a centered dialog.
 */
export function getTourSteps(document) {
    return TOUR_STEPS.map((step) => {
        const { selector, title, description } = step;
        const element = selector ? document.querySelector(selector) : null;
        return {
            element,
            popover: { title, description },
        };
    });
}

let driverPromise = null;

/**
 * Lazy load driver.js, its stylesheet and app-tour.css, once, so that they
 * are only fetched when the tour is actually shown. Resolves to the
 * driver function.
 */
function loadDriver() {
    if (driverPromise === null) {
        driverPromise = Promise.all([
            import("driver.js"),
            import("driver.js/dist/driver.css"),
            // Overrides driver.css by specificity (.app-tour-popover),
            // as the load order of the stylesheets is not guaranteed.
            import("./app-tour.css"),
        ]).then(
            ([{ driver }]) => driver,
            (error) => {
                // Allow a retry, e.g. after a network error.
                driverPromise = null;
                throw error;
            },
        );
    }
    return driverPromise;
}

/**
 * Start the tour, unless it was viewed before and force is false.
 * The tour counts as viewed when it is closed, not when it starts.
 * driver.js is loaded on demand, hence this is async and resolves to the
 * driver.js instance or null.
 */
export async function startTour(domTool, { force = false } = {}) {
    const { window, document } = domTool;
    if (!force && hasViewedTour(window)) return null;

    const driver = await loadDriver();

    // Resolve the steps after loading, the UI may have changed meanwhile.
    const steps = getTourSteps(document);
    const tour = driver({
        steps,
        popoverClass: "app-tour-popover",
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        closeBtnLabel: "Close",
        // Called when the user closes the tour: close button, Done,
        // Escape and overlay click. Unlike onDestroyed, it is also called
        // before the first highlight animation has finished.
        onDestroyStarted: () => {
            setTourViewed(window);
            tour.destroy();
        },
    });
    tour.drive();
    return tour;
}

/**
 * The shell app's onAppReady hook: start the tour on the first visit.
 * The "tour" location hash flag (e.g. "#[tour]") forces it. It's never
 * started when embedded/opened by another app or when playback is
 * controlled by the "autoplay"/"autopause" flags, as these are
 * presentation uses, not even with the "tour" flag.
 */
export function autoStartTour({ domTool, uiFlags, isEmbedded }) {
    if (isEmbedded || uiFlags.has("autoplay") || uiFlags.has("autopause"))
        return;
    const force = uiFlags.has("tour");
    // Let the active layout insert its elements before measuring.
    domTool.window.requestAnimationFrame(() => startTour(domTool, { force }));
}
