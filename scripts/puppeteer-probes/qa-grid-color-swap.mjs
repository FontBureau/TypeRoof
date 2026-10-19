// QA probe: the grid's two color fields are ONE
// UIColorChooserTwoColorsWithSwap (FG/BG patches + swap button) — verifies
// the wiring after replacing the two UIColorChooser instances: the chooser
// renders in the grid-manager zone (TypeTensorController's zone 'main'),
// both patches are bound to the state colors, and the swap button
// exchanges textColor/backgroundColor in the state.
// The exchange is asserted at the STATE level (the color model fields):
// swapping is an involution — the second swap restores crosswise the values
// the first swap had produced — independent of culori's format-notation
// details of materializing previously inherited colors. The FG patch is
// additionally asserted to take over the previous BG rendering (mapping:
// color1 => textColor, color2 => backgroundColor).
/* global shell */

export async function run({ page, consoleLines, setTimeout, log }) {
    const failures = []
      , check = (label, condition, detail = "") => {
            log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
            if (!condition) failures.push(label);
        }
      , settle = (ms) => setTimeout(ms)
      , readPatchColors = () =>
            page.evaluate(() => {
                const chooser = document.querySelector(
                    ".ui_color_chooser_two_colors",
                );
                return chooser
                    ? [...chooser.querySelectorAll(".ui_color_patch")].map(
                          (patch) => patch.style.getPropertyValue("--color"),
                      )
                    : [];
            })
      , readStateColors = () =>
            page.evaluate(() => {
                // Read the color values through the model tree (the app's
                // own data, no format-notation involved): empty
                // (Angle)NumberOrEmptyModels read as "EMPTY".
                const extract = (model) => {
                    if (model === null || model === undefined) return null;
                    if (typeof model.isEmpty === "boolean")
                        return model.isEmpty ? "EMPTY" : model.value;
                    if (model?.value !== undefined) return model.value;
                    return String(model);
                };
                const readColor = (path) => {
                    const entry = shell.getEntry(path)
                      , out = {
                            ctor: entry?.constructor?.name
                          , fields: null
                        };
                    try {
                        const fields = {};
                        for (const [key, value] of entry) {
                            const sub = {};
                            if (
                                value?.get !== undefined &&
                                typeof value?.[Symbol.iterator] === "function"
                            )
                                for (const [k, v] of value) sub[k] = extract(v);
                            else sub.value = extract(value);
                            fields[key] = sub;
                        }
                        out.fields = fields;
                    } catch (error) {
                        out.fields = `ERR:${error?.message ?? error}`;
                    }
                    return out;
                };
                return {
                    text: readColor("/activeState/properties/textColor")
                  , bg: readColor("/activeState/properties/backgroundColor")
                };
            })
      , swap = () =>
            page.evaluate(() => {
                const chooser = document.querySelector(
                    ".ui_color_chooser_two_colors",
                );
                const button = [...chooser.querySelectorAll("button")].find(
                    (el) =>
                        (el.getAttribute("title") || "").includes("swap") ||
                        el.className.includes("swap"),
                );
                if (!button) return "NO-BUTTON";
                button.dispatchEvent(
                    new MouseEvent("click", { bubbles: true }),
                );
                return "clicked";
            })
      ;

    await page.evaluate(() => {
        shell.changeState(() => {
            shell.getEntry("/activeLayoutKey").value = "TypeToolsGrid";
        });
    });
    await settle(4000);

    const beforeInfo = await page.evaluate(() => {
        const chooser = document.querySelector(".ui_color_chooser_two_colors");
        return {
            chooserExists: chooser !== null
          , inGridManager: chooser
                ? !!chooser.closest(".grid-manager")
                : false
          , patchCount: chooser
                ? chooser.querySelectorAll(".ui_color_patch").length
                : 0
          , swapButtonCount: chooser
                ? [...chooser.querySelectorAll("button")].filter(
                      (el) =>
                          (el.getAttribute("title") || "").includes("swap") ||
                          el.className.includes("swap"),
                  ).length
                : 0
        };
    });
    const beforePatchColors = await readPatchColors()
      , beforeStateColors = await readStateColors();
    log(
        `before: ${JSON.stringify(beforeInfo)} patches=${JSON.stringify(
            beforePatchColors,
        )} state=${JSON.stringify(beforeStateColors)}`,
    );
    check("two-colors chooser rendered", beforeInfo.chooserExists === true);
    check(
        "chooser is in the grid-manager zone",
        beforeInfo.inGridManager === true,
    );
    check(
        "two color patches",
        beforeInfo.patchCount === 2,
        `patches=${beforeInfo.patchCount}`,
    );
    check("swap button present", beforeInfo.swapButtonCount >= 1);
    // The grid borrows the opaque white stageBackgroundColor registered
    // default for an unset background (see _getGridRegisteredDefault in
    // type-tools-grid.mjs): the BG patch must render filled white, not
    // the transparent colors/backgroundColor registry default.
    check(
        "BG patch default renders opaque white",
        beforePatchColors[1] === "oklch(1 0 none)",
        `bg patch --color=${JSON.stringify(beforePatchColors[1])}`,
    );

    // swap once: both (previously inherited) colors materialize in the
    // state, exchanged.
    check("swap click 1", (await swap()) === "clicked");
    await settle(2000);
    const stateOne = await readStateColors()
      , patchColorsOne = await readPatchColors();
    log(
        `after swap 1: patches=${JSON.stringify(
            patchColorsOne,
        )} state=${JSON.stringify(stateOne)}`,
    );
    check(
        "swap 1 materialized both state colors (explicit values)",
        stateOne.text?.fields !== null &&
            typeof stateOne.text?.fields === "object" &&
            !String(stateOne.text?.fields).startsWith("ERR") &&
            stateOne.bg?.fields !== null &&
            typeof stateOne.bg?.fields === "object" &&
            !String(stateOne.bg?.fields).startsWith("ERR"),
        `text=${JSON.stringify(stateOne.text?.fields)} bg=${JSON.stringify(
            stateOne.bg?.fields,
        )}`,
    );

    // swap again: an involution — the state values restore crosswise.
    check("swap click 2", (await swap()) === "clicked");
    await settle(2000);
    const stateTwo = await readStateColors();
    log(`after swap 2: state=${JSON.stringify(stateTwo)}`);
    check(
        "swap is an involution (state colors restored crosswise)",
        JSON.stringify(stateTwo.text) === JSON.stringify(stateOne.bg) &&
            JSON.stringify(stateTwo.bg) === JSON.stringify(stateOne.text),
        `text ${JSON.stringify(stateOne.text?.fields)} -> ${JSON.stringify(
            stateTwo.text?.fields,
        )}`,
    );

    // the FG patch renders the previous BG rendering => the patch/state
    // mapping is straight (color1 => textColor, color2 => backgroundColor).
    check(
        "FG patch took over the previous BG rendering",
        patchColorsOne[0] === beforePatchColors[1],
        `${JSON.stringify(beforePatchColors)} -> ${JSON.stringify(
            patchColorsOne,
        )}`,
    );

    const pageErrors = consoleLines.filter((line) =>
        line.startsWith("[PAGEERROR]"),
    );
    check(
        "no page errors",
        pageErrors.length === 0,
        pageErrors.slice(0, 3).join(" | "),
    );

    if (failures.length > 0)
        throw new Error(`QA FAILURES: ${failures.join(", ")}`);
    log("grid two-colors-swap probe passed");
}