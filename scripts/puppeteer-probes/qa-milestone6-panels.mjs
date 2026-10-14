// Probe for scripts/debug-with-puppeteer.mjs — milestone 6 QA: the
// greedy-fit properties panel's named-potentials fields work end to
// end. UI -> model wiring (the pure resolution paths are covered by
// vitest):
//   1. compare mode + greedy-fit on the root type-spec;
//   2. the panel exposes the potentials/potentialsAnchoring selects
//      (defaults auto/run), the treatments off-list and the
//      overrides map;
//   3. "+ disable treatment" inserts an editable item; typing a tag
//      commits to the model;
//   4. coherence: selecting a NAMED potentials configuration prunes
//      off-list entries it does not offer (auto leaves them);
//   5. the overrides map: add tag -> key -> a per-entry number input
//      commits tag -> number;
//   6. zero console errors throughout.

/* global shell */

const SETTLE_MS = 600;

const errorsOf = (consoleLines) =>
    consoleLines.filter(
        (line) =>
            line.includes("Uncaught") ||
            line.includes("TypeError") ||
            line.includes("KEY ERROR") ||
            line.includes("Can't find generic UI-Element"),
    );

// the root type-spec instance of the textCompositionAlgorithm struct
const statePaths = {
    algorithm:
        "/activeState/typeSpec/textCompositionAlgorithm",
    instance:
        "/activeState/typeSpec/textCompositionAlgorithm/instance",
    potentials:
        "/activeState/typeSpec/textCompositionAlgorithm/instance/potentials",
    treatments:
        "/activeState/typeSpec/textCompositionAlgorithm/instance/treatments",
    overrides:
        "/activeState/typeSpec/textCompositionAlgorithm/instance/potentialsLocationOverrides",
};

const model = (page) =>
    page.evaluate((paths) => {
        const treatments = shell.getEntry(paths.treatments),
            overrides = shell.getEntry(paths.overrides),
            potentials = shell.getEntry(paths.potentials);
        return {
            potentialsEmpty: potentials?.isEmpty ?? null,
            potentialsValue: potentials?.isEmpty ? null : potentials?.value,
            offList: treatments ? [...treatments].map(([, t]) => t.value) : null,
            overrides: overrides
                ? Object.fromEntries([...overrides].map(([k, v]) => [k, v.value]))
                : null,
        };
    }, statePaths);

const clickButtonByText = (page, text, scope = "") =>
    page.evaluate(
        (text, scope) => {
            const root = scope
                ? document.querySelector(scope) ?? document.body
                : document.body,
                button = [...root.querySelectorAll("button")].find(
                    (b) => b.textContent.trim() === text,
                );
            if (button === undefined) return false;
            button.click();
            return true;
        },
        text,
        scope,
    );

export async function run({ page, consoleLines, setTimeout, log }) {
    const settle = () => setTimeout(SETTLE_MS);

    // 1. compare mode + greedy-fit on the root type-spec
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "compare";
            shell.getEntry(
                "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
            ).value = "TextCompositionAlgorithmGreedyFitModel";
        }),
    );
    await settle();

    // expand the sidebar Properties and the Text Composition collapsibles
    await page.evaluate(() => {
        const expand = (label) => {
            const toggler = [
                ...document.querySelectorAll('[role="button"][aria-expanded]'),
            ].find((el) => el.textContent.trim() === label);
            if (
                toggler !== undefined &&
                toggler.getAttribute("aria-expanded") !== "true"
            )
                toggler.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        };
        const manager = document.querySelector(".properties-manager");
        expand("TypeSpec Properties");
        if (manager !== null && getComputedStyle(manager).display === "none") {
            expand("TypeSpec Properties");
            manager.style.display = "";
        }
        expand("Text Composition");
    });
    await settle();

    // 2. the panel exposes the new widgets
    const exposed = await page.evaluate(() => ({
        selects: [...document.querySelectorAll("select")]
            .map((select) => select.value)
            .filter((value) => ["auto", "run"].includes(value)),
        disableButton: [...document.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === "+ disable treatment",
        ),
        addTagButton: [...document.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === "add tag",
        ),
    }));
    log("panel widgets:", JSON.stringify(exposed));
    if (
        !exposed.selects.includes("auto") ||
        !exposed.selects.includes("run")
    )
        throw new Error("potentials/potentialsAnchoring selects missing");
    if (!exposed.disableButton)
        throw new Error("no + disable treatment button");
    if (!exposed.addTagButton) throw new Error("no add tag button");

    // 3. add a disabled-treatment item and type a tag
    if (!(await clickButtonByText(page, "+ disable treatment")))
        throw new Error("+ disable treatment not clickable");
    await settle();
    await page.evaluate(() => {
        const input = document.querySelector(
            ".ui_type_driven-list .ui_base_list_item input",
        );
        if (input === null) throw new Error("no treatment item input after add");
        input.focus();
        if (document.activeElement !== input)
            throw new Error("treatment item input not focusable");
    });
    await page.keyboard.type("XTRA", { delay: 20 });
    await page.evaluate(() => document.activeElement?.blur());
    await settle();
    let state = await model(page);
    log("after typing XTRA:", JSON.stringify(state));
    if (state.potentialsValue !== null)
        throw new Error("potentials should default empty (auto)");
    if (state.offList?.[0] !== "XTRA")
        throw new Error(`XTRA not committed to the model: ${JSON.stringify(state.offList)}`);

    // 4. coherence: a named configuration prunes entries it doesn't
    //    offer; auto keeps them
    await page.evaluate(() => {
        const select = [...document.querySelectorAll("select")].find(
            (s) => [...s.options].some((o) => o.value === "robotoFlexHeadline"),
        );
        if (select === undefined) throw new Error("no potentials select");
        select.value = "robotoFlexHeadline";
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    state = await model(page);
    log("after selecting robotoFlexHeadline:", JSON.stringify(state));
    if (state.potentialsValue !== "robotoFlexHeadline")
        throw new Error("potentials selection not committed");
    // robotoFlexHeadline offers only wdth: XTRA must be pruned
    if (state.offList?.length !== 0)
        throw new Error(`coherence did not prune XTRA: ${JSON.stringify(state.offList)}`);
    // back to auto: the off-list stays empty (pruned data is gone);
    // type wdth to confirm the off-list accepts an offered tag again
    await page.evaluate(() => {
        const select = [...document.querySelectorAll("select")].find((s) =>
            [...s.options].some((o) => o.value === "robotoFlexHeadline"),
        );
        select.value = "auto";
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    if (!(await clickButtonByText(page, "+ disable treatment")))
        throw new Error("+ disable treatment not clickable (second)");
    await settle();
    await page.evaluate(() => {
        const input = document.querySelector(
            ".ui_type_driven-list .ui_base_list_item input",
        );
        input.focus();
    });
    await page.keyboard.type("wdth", { delay: 20 });
    await page.evaluate(() => document.activeElement?.blur());
    await settle();
    state = await model(page);
    log("after typing wdth (auto):", JSON.stringify(state));
    if (!state.offList?.includes("wdth"))
        throw new Error("wdth not committed after auto re-select");

    // 5. the overrides map: add tag -> key -> value
    await page.evaluate(() => {
        const input = document.querySelector(
            ".ui_potentials-location_overrides .tools input",
        );
        if (input === null) throw new Error("no overrides key-create input");
        input.focus();
        if (document.activeElement !== input)
            throw new Error("overrides key-create input not focusable");
    });
    await page.keyboard.type("opsz", { delay: 30 });
    await page.keyboard.press("Enter");
    await settle();
    await page.evaluate(() => {
        const input = document.querySelector(
            ".ui_potentials-location_overrides .ui_potentials-override_value input",
        );
        if (input === null) throw new Error("no override value input after key");
        input.focus();
        if (document.activeElement !== input)
            throw new Error("override value input not focusable");
    });
    await page.keyboard.type("24", { delay: 40 });
    await page.evaluate(() => document.activeElement?.blur());
    await settle();
    state = await model(page);
    log("after overrides opsz=24:", JSON.stringify(state));
    if (state.overrides?.opsz !== 24)
        throw new Error(
            `override opsz=24 not committed: ${JSON.stringify(state.overrides)}`,
        );

    // 6. zero console errors throughout
    const errors = errorsOf(consoleLines);
    if (errors.length > 0) {
        log("ALL ERRORS:", JSON.stringify(errors, null, 1));
        throw new Error(`console errors: ${errors.length}`);
    }
    log("OK — milestone-6 potentials UI works end to end");
}