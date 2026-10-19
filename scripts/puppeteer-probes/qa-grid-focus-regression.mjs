// QA probe: type-tools-grid single-cell (both dimensions NULL, amount 1)
// focus regression — typing in the lone ProseMirror instance loses the
// caret after the first char.
// Suspect: 18cfbdd2 added "properties" to the applyPresets coherence
// inputs => every PM edit flips presets->"custom" and replaces the
// whole `properties` model via setFn => typeSpecProperties@ fires =>
// UIGridScaffold full clear+append rebuild => focused PM DOM is
// moved/recreated => blur.
// Reports per keystroke: activeElement, PM node identity/connectedness,
// text, presets value, properties/document identity, page errors.

/* global shell */

export async function run({ page, consoleLines, setTimeout, log }) {
    const failures = []
      , check = (label, condition, detail = "") => {
            log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
            if (!condition) failures.push(label);
        }
      , settle = (ms) => setTimeout(ms)
      ;

    // 1. switch to the grid layout
    await page.evaluate(() => {
        shell.changeState(() => {
            shell.getEntry("/activeLayoutKey").value = "TypeToolsGrid";
        });
    });
    await settle(4000);

    // 2. both dimensions NULL with amount 1 => exactly one cell.
    //    The amount write needs its own changeState: the typeKey change
    //    reshapes the dynamic model, so `instance/amountValue` resolves
    //    only after that changeState committed.
    await page.evaluate(() => {
        shell.changeState(() => {
            for (const dimension of ["dimensionX", "dimensionY"]) {
                shell.getEntry(
                    `/activeState/properties/${dimension}/dimensionSequenceTypeKey`,
                ).value = "NULL";
            }
        });
    });
    await settle(1500);
    const nullResult = await page.evaluate(() => {
        try {
            shell.changeState(() => {
                for (const dimension of ["dimensionX", "dimensionY"]) {
                    shell.getEntry(
                        `/activeState/properties/${dimension}/instance/amountValue`,
                    ).value = 1;
                }
            });
            return "ok";
        } catch (error) {
            return `ERROR: ${error?.message ?? error}`;
        }
    });
    await settle(3000);
    log(`dimensions->NULL(1): ${nullResult}`);

    // 3. capture references + PM state
    const refs = await page.evaluate(() => {
        const gridPMs = document.querySelectorAll(
            ".ui_type_tools_grid .ProseMirror",
        );
        return {
            gridPMCount: gridPMs.length
          , allPMCount: document.querySelectorAll(".ProseMirror").length
          , presets: shell.getEntry("/activeState/presets").value
          , editable: gridPMs[0]
                ? gridPMs[0].getAttribute("contenteditable")
                : null
          , text: gridPMs[0] ? gridPMs[0].textContent : null
        };
    });
    log(`refs: ${JSON.stringify(refs)}`);
    if (nullResult === "ok")
        check("single grid-cell PM", refs.gridPMCount === 1, `grid=${refs.gridPMCount} all=${refs.allPMCount}`);
    else
        log(`NOTE: no single-cell grid (amount write failed) — asserting on the first grid PM of ${refs.gridPMCount}`);

    // 4. focus the grid-cell PM
    await page.evaluate(() => {
        const pm = document.querySelector(".ui_type_tools_grid .ProseMirror");
        pm.focus();
        getSelection().removeAllRanges();
        pm.blur();
        pm.focus();
    });
    await settle(300);
    const focusInfo = await page.evaluate(() => {
        const el = document.activeElement;
        return {
            isPM: el !== null && el.classList.contains("ProseMirror")
          , tag: el ? el.tagName : null
        };
    });
    log(`focus: ${JSON.stringify(focusInfo)}`);
    check("PM focused", focusInfo.isPM === true, `active=${focusInfo.tag}`);

    // place caret at start of the text
    const caretOk = await page.evaluate(() => {
        const pm = document.querySelector(".ui_type_tools_grid .ProseMirror");
        const range = document.createRange();
        range.setStart(pm, 0);
        range.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        return getSelection().anchorOffset;
    });
    log(`caret placed at offset ${caretOk}`);

    // 5. type three chars, observe after each
    const states = [];
    for (const char of ["X", "Y", "Z"]) {
        await page.keyboard.type(char, { delay: 80 });
        await settle(1200);
        states.push(
            await page.evaluate(() => {
                const pm = document.querySelector(
                    ".ui_type_tools_grid .ProseMirror",
                )
                  , currentProps = shell.getEntry("/activeState/properties")
                  , currentDoc = shell.getEntry("/activeState/document")
                  , state = {
                    activeIsPM:
                        document.activeElement !== null &&
                        document.activeElement.classList.contains("ProseMirror")
                      , presets: shell.getEntry("/activeState/presets").value
                      , propsReplacedSincePrevKeystroke:
                        window.__prevProps !== undefined &&
                        window.__prevProps !== currentProps
                      , docReplacedSincePrevKeystroke:
                        window.__prevDoc !== undefined &&
                        window.__prevDoc !== currentDoc
                      , text: pm ? pm.textContent.slice(0, 40) : null
                    };
                window.__prevProps = currentProps;
                window.__prevDoc = currentDoc;
                return state;
            }),
        );
        log(`after "${char}": ${JSON.stringify(states.at(-1))}`);
    }

    check("focus retained after 1st char", states[0].activeIsPM === true);
    check("focus retained after 3rd char", states[2].activeIsPM === true);
    check(
        "all three chars arrived",
        (states[2].text || "").includes("XYZ"),
        `text=${states[2].text}`,
    );
    if (states.some((s) => s.propsReplaced))
        log("properties model was REPLACED (setFn) during typing");
    if (states.some((s) => s.presets !== states[0].presets))
        log(`presets flipped during typing: ${states.map((s) => s.presets).join(" -> ")}`);

    const pageErrors = consoleLines.filter((line) =>
        line.startsWith("[PAGEERROR]"),
    );
    check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    if (failures.length > 0)
        throw new Error(`QA FAILURES: ${failures.join(", ")}`);
    log("grid focus probe passed");
}