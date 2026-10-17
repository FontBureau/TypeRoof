// Probe for scripts/debug-with-puppeteer.mjs — approach (a) phase 5 QA
// (plan 2026-10-12-2127-inline-node-refinements-approach-a.md, phase 5:
// "Node Style Links" UI wiring). Asserts the third style-link family's
// editing surface in the TypeSpec properties manager:
//   * the "Node Style Links" map renders next to Soft/Hard Style Links
//     inside the Style Links collapsible (root typeSpec opened via the
//     TypeSpec-Tree item click);
//   * the map lists node type keys (edge created via the state API,
//     like the phase-4 channel probe): the generic-inline key item
//     shows in the map, with the key-change select offering the
//     unlink mode and the create select offering the style patches;
//   * the inherited list shows the SHIPPED root demo edge (quote ->
//     serif italic, phase 6.3) on the edited typeSpec while the
//     UI-created LOCAL edge stays out of it, and shows inherited
//     edges on a CHILD typeSpec (whole-edge inheritance down the
//     tree).// Interaction feel (drag/drop, create/unlink via clicks) stays with
// human QA.

/* global shell */

export const url =
    "http://localhost:3100/TypeRoof/app/wikipedia/index.html";

export async function run({ page, consoleLines, setTimeout, log }) {
    const failures = [],
        check = (label, condition, detail = "") => {
            log(
                `${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`,
            );
            if (!condition) failures.push(label);
        },
        settle = async (ms = 1000) => {
            await setTimeout(ms);
        },
        pageErrors = () =>
            consoleLines.filter((line) => line.includes("[PAGEERROR]"));

    if (
        !(await page.evaluate(() => {
            const form = document.querySelector("form");
            if (form === null) return false;
            form.dispatchEvent(new Event("submit", { cancelable: true }));
            return true;
        }))
    )
        throw new Error("PROBE FAIL: no wikipedia load form found");
    await page.waitForFunction(
        () => {
            const host =
                document.querySelector(".ProseMirror") ?? document.body;
            return host.textContent.includes("typeface");
        },
        { timeout: 60_000, polling: 500 },
    );

    // open the ROOT typeSpec in the properties manager: the TypeSpec-
    // Tree item click sets editingTypeSpec (tree-editor's toggle).
    const clickTreeItem = (index) =>
        page.evaluate((index) => {
            const labels = [
                ...document.querySelectorAll(".ui_type_spec_tree-item-label"),
            ];
            if (labels.length <= index)
                throw new Error(
                    `no type spec tree item #${index} (${labels.length} items)`,
                );
            labels[index].click();
        }, index);
    // The TypeSpec-Tree lists the ROOT typeSpec's CHILDREN (no root
    // item): tree item #0 = child typeSpec #1.
    await clickTreeItem(0);
    await settle();

    const openStyleLinksCollapsible = () =>
        page.evaluate(() => {
            const collapsible = document.querySelector(
                ".ui_collapsible-typespec_style_links",
            );
            if (collapsible === null)
                throw new Error("no style links collapsible");
            const toggler = collapsible.querySelector(".ui_collapsible_toggle");
            if (toggler.getAttribute("aria-expanded") !== "true")
                toggler.click();
        });

    // open the Style Links collapsible (aria-expanded toggler)
    await openStyleLinksCollapsible();
    await settle();

    // locate the third family's map root by its section label
    const findNodeMap = () =>
        page.evaluate(() => {
            const contents = document.querySelector(
                ".ui_collapsible-typespec_style_links-contents",
            );
            if (contents === null) return null;
            const maps = [...contents.querySelectorAll(".ui_links_map")];
            return (
                maps.find((map) =>
                    map.textContent.includes("Node Style Links"),
                ) ?? null
            );
        });
    const nodeMap = await findNodeMap();
    check(
        '"Node Style Links" section renders (map root)',
        nodeMap !== null,
        nodeMap === null ? "no .ui_links_map with the label" : "found",
    );
    if (nodeMap === null) {
        throw new Error("PROBE FAIL: no Node Style Links map found");
    }

    // the create select offers the style patches ("bold" ships in the
    // state) and the map is initially empty (no key items)
    const createSelectInfo = await page.evaluate(() => {
        const contents = document.querySelector(
            ".ui_collapsible-typespec_style_links-contents",
        );
        const map = [...contents.querySelectorAll(".ui_links_map")].find(
            (m) => m.textContent.includes("Node Style Links"),
        );
        const select = map.querySelector(".ui_links_map-create_select");
        if (select === null) return { found: false };
        const options = [...select.querySelectorAll("option")].map(
            (option) => option.value,
        );
        return { found: true, options, value: select.value ?? null };
    });
    check(
        "create select offers the style patches (incl. \"bold\")",
        createSelectInfo.found === true &&
            createSelectInfo.options?.includes("bold"),
        JSON.stringify(createSelectInfo),
    );

    // create an edge through the REAL UI flow (this is the phase-5
    // surface): set the create select to the "bold" style patch (the
    // select's value becomes the new edge's stylePatch), enter the
    // node type key into the key-create input, click the create
    // button.
    const uiCreateEdge = () =>
        page.evaluate(() => {
            const contents = document.querySelector(
                ".ui_collapsible-typespec_style_links-contents",
            );
            const map = [...contents.querySelectorAll(".ui_links_map")].find(
                (m) => m.textContent.includes("Node Style Links"),
            );
            const select = map.querySelector("select");
            const input = map.querySelector("input");
            const addButton = [...map.querySelectorAll("button")].find(
                (button) => button.textContent.includes("create"),
            );
            if (!select || !input || !addButton)
                throw new Error(
                    `map UI incomplete: select=${!!select} input=${!!input} add=${!!addButton}`,
                );
            // set the style patch target (native select)
            select.value = "bold";
            select.dispatchEvent(
                new Event("change", { cancelable: true, bubbles: true }),
            );
            // enter the node type key (native setter + input event)
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            ).set;
            setter.call(input, "generic-inline");
            input.dispatchEvent(
                new Event("input", { cancelable: true, bubbles: true }),
            );
            addButton.click();
        });
    await uiCreateEdge();
    await settle(2500);

    // the map lists the node type key: the key item's input carries
    // "generic-inline" and the key-change select offers the unlink mode
    const keyItemInfo = await page.evaluate(() => {
        const contents = document.querySelector(
            ".ui_collapsible-typespec_style_links-contents",
        );
        const map = [...contents.querySelectorAll(".ui_links_map")].find(
            (m) => m.textContent.includes("Node Style Links"),
        );
        const inputs = [...map.querySelectorAll("input")].map(
            (input) => input.value,
        );
        const keySelect = map.querySelector(
            ".ui_links_map-item_value-change_select",
        );
        const options =
            keySelect === null
                ? []
                : [...keySelect.querySelectorAll("option")].map(
                      (option) => [option.value, option.textContent].join(":"),
                  );
        return { inputs, options };
    });
    check(
        "map lists the \"generic-inline\" node type key",
        keyItemInfo.inputs.includes("generic-inline"),
        JSON.stringify(keyItemInfo.inputs),
    );
    check(
        "key-change select offers the unlink mode",
        keyItemInfo.options.some(([value]) => value.includes("unlink")) ||
            keyItemInfo.options.join("|").toLowerCase().includes("unlink"),
        JSON.stringify(keyItemInfo.options),
    );
    // the created edge model: link mode targeting the "bold" patch
    // (the create select's value)
    const edgeModelInfo = await page.evaluate(() => {
        const editing = shell.getEntry("/activeState/editingTypeSpec");
        if (editing.isEmpty) return { found: false };
        const links = shell.getEntry(
            `/activeState/typeSpec/${editing.value.toString()}/inlineNodesStyleLinks`,
        );
        if (!links.has("generic-inline"))
            return { found: true, edge: null };
        const edge = links.get("generic-inline");
        return {
            found: true,
            edge: {
                mode: edge.get("mode").value,
                stylePatch: edge.get("stylePatch").value,
            },
        };
    });
    check(
        "created edge: mode link, stylePatch \"bold\"",
        edgeModelInfo.found === true &&
            edgeModelInfo.edge?.mode === "link" &&
            edgeModelInfo.edge?.stylePatch === "bold",
        JSON.stringify(edgeModelInfo),
    );

    // inherited list: with the shipped root demo edge (quote → serif
    // italic), the edited typeSpec INHERITS it — and the UI-created
    // LOCAL edge must stay out of the inherited list (locally defined
    // edges are managed in the map below)
    const inheritedInfo = await page.evaluate(() => {
        const contents = document.querySelector(
            ".ui_collapsible-typespec_style_links-contents",
        );
        const inherited = [
            ...contents.querySelectorAll(".ui_links_map-inherited"),
        ];
        const el = inherited.find((item) =>
            item.textContent.includes("Inherited Node Style Links"),
        );
        if (el === null)
            return { found: false, visible: false, text: "" };
        return {
            found: true,
            visible: el.style.display !== "none",
            text: el.textContent,
        };
    });
    check(
        "inherited list shows the shipped root edge; the UI-created local edge stays out",
        inheritedInfo.found === true &&
            inheritedInfo.visible === true &&
            inheritedInfo.text.includes("quote") &&
            inheritedInfo.text.includes("serif italic") &&
            !inheritedInfo.text.includes("generic-inline"),
        JSON.stringify(inheritedInfo),
    );

    // switch to ANOTHER child typeSpec (tree item #1): the local edge
    // is inherited (whole-edge inheritance) — the inherited list must
    // show "generic-inline: bold" and be visible. NOTE: the properties
    // manager re-creates its wrappers for the new typeSpec: re-open the
    // collapsible first.
    await clickTreeItem(1);
    await settle();
    await openStyleLinksCollapsible();
    await settle();
    const inheritedShown = await page.evaluate(() => {
        const contents = document.querySelector(
            ".ui_collapsible-typespec_style_links-contents",
        );
        const inherited = [...contents.querySelectorAll(".ui_links_map-inherited")];
        const el = inherited.find((item) =>
            item.textContent.includes("Inherited Node Style Links"),
        );
        if (el === null) return { found: false, text: "" };
        return { found: true, visible: el.style.display !== "none", text: el.textContent };
    });
    check(
        "inherited list shows the inherited edge on a child typeSpec",
        inheritedShown.found === true &&
            inheritedShown.visible === true &&
            inheritedShown.text.includes("generic-inline"),
        JSON.stringify(inheritedShown),
    );

    check(
        "no PAGEERROR (whole probe)",
        pageErrors().length === 0,
        pageErrors().join(" | "),
    );

    if (failures.length !== 0) {
        throw new Error(
            `PROBE FAIL (${failures.length}): ${failures.join(" | ")}`,
        );
    }
    log("node style links UI QA: PROBE PASSED");
}
