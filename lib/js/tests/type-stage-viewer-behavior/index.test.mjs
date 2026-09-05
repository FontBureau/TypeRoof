// @vitest-environment jsdom
// Behavior safety net for the document-tree walker/renderer separation
// (Phase 5a, thoughts/plans/2026-09-05-2159-document-tree-walker-renderer-separation.md).
// These tests pin *observable* viewer behavior — DOM structure, element
// identity, text content, mode switching — and must pass UNCHANGED before
// and after the refactor. They deliberately never reference viewer-internal
// class or method names: implementations may move freely.
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";

import { StateComparison } from "../../metamodel.mjs";
import {
    NodeModel,
    MarkModel,
} from "../../components/prosemirror/models.typeroof.jsx";
import { buildWorld } from "../type-stage-toggles/harness.mjs";

const HAVE_FIXTURE = existsSync("lib/js/tests/fixtures/typography-small.html");

// Viewer DOM queries — the only coupling to the rendered output.
const layoutZone = (world) => world.zones.get("layout"),
    queryArticle = (world) =>
        layoutZone(world).querySelector("article.typeroof-document"),
    queryHost = (world) =>
        layoutZone(world).querySelector(".ui_prosemirror_host"),
    // Direct rendered children of the article, in DOM order, as their
    // data-node-type values (the fixture's top-level nodes are all
    // rendered elements).
    articleChildTypes = (world) =>
        [...queryArticle(world).children].map((el) =>
            el.getAttribute("data-node-type"),
        );

// Model access helpers — document tree navigation only, no viewer internals.
// NOTE: list-model iteration yields [key, value] pairs.
const documentModel = (state) => state.get("activeState").get("document"),
    contentList = (state) => documentModel(state).get("content"),
    listValues = (list) => [...list].map(([, value]) => value),
    topLevelTypes = (state) =>
        listValues(contentList(state)).map((node) => node.get("typeKey").value);

// Find the first text node in the document tree (depth-first); returns
// the node or null.
function findFirstTextNode(node) {
    if (node.get("typeKey").value === "text") return node;
    for (const [, child] of node.get("content")) {
        const found = findFirstTextNode(child);
        if (found) return found;
    }
    return null;
}

describe.skipIf(!HAVE_FIXTURE)("type-stage viewer behavior", () => {
    let world, oldState;

    const applyChange = (fn) => {
        const draft = oldState.getDraft();
        fn(draft.get("activeState"));
        const newState = draft.metamorphose();
        // The shell sets the current state before dispatching the
        // update; provisioning (activation tests) reads current state.
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));
        oldState = newState;
    };

    beforeAll(async () => {
        world = await buildWorld();
        oldState = world.getState();
    }, 300_000);

    it("G1: compare mode mounts editor host and viewer article side by side", () => {
        applyChange((activeState) => {
            activeState.get("documentRendererMode").value = "compare";
        });
        const host = queryHost(world),
            article = queryArticle(world);
        expect(host).not.toBeNull();
        expect(article).not.toBeNull();
        // Both are children of the same layout container.
        expect(host.parentElement).toBe(article.parentElement);
        // Both are live: the article has rendered content, the host
        // contains the ProseMirror editor.
        expect(article.children.length).toBeGreaterThan(0);
        expect(host.querySelector(".ProseMirror")).not.toBeNull();
    });

    it("G2: viewer DOM is correct after an editor round-trip", () => {
        const expectedTypes = topLevelTypes(oldState);
        // Capture the rendered structure before leaving viewer mode.
        const beforeTypes = articleChildTypes(world);
        expect(beforeTypes).toEqual(expectedTypes);

        applyChange((activeState) => {
            activeState.get("documentRendererMode").value = "editor";
        });
        expect(queryArticle(world)).toBeNull();
        expect(queryHost(world)).not.toBeNull();

        applyChange((activeState) => {
            activeState.get("documentRendererMode").value = "viewer";
        });
        expect(queryHost(world)).toBeNull();
        // The old article element was destroyed; re-query.
        const article = queryArticle(world);
        expect(article).not.toBeNull();
        expect(articleChildTypes(world)).toEqual(expectedTypes);
        // Text content survives the round-trip.
        const firstTextNode = findFirstTextNode(documentModel(oldState));
        expect(article.textContent).toContain(firstTextNode.get("text").value);
    });

    it("G3: inserting nodes into the document renders them in order", () => {
        const typesBefore = articleChildTypes(world);
        const insertNode = (index, typeKey, text) =>
            applyChange((activeState) => {
                const draft = NodeModel.createPrimalDraft({});
                draft.get("typeKey").value = typeKey;
                if (text !== undefined) {
                    // Block node with inline content: wrap the text run.
                    const textDraft = NodeModel.createPrimalDraft({});
                    textDraft.get("typeKey").value = "text";
                    textDraft.get("text").value = text;
                    draft.get("content").push(textDraft.metamorphose());
                }
                activeState
                    .get("document")
                    .get("content")
                    .splice(index, 0, draft.metamorphose());
            });

        // Insert at the front (a typeKey that exists in the schema).
        insertNode(0, "heading-3", "Inserted heading");
        expect(articleChildTypes(world)[0]).toBe("heading-3");
        expect(queryArticle(world).children[0].textContent).toContain(
            "Inserted heading",
        );
        expect(articleChildTypes(world).length).toBe(typesBefore.length + 1);

        // Insert in the middle; DOM order follows collection order.
        insertNode(2, "heading-3", "Inserted subheading");
        const types = articleChildTypes(world);
        expect(types[0]).toBe("heading-3");
        expect(types[2]).toBe("heading-3");
        expect(types[1]).toBe(typesBefore[0]);
        expect(types[3]).toBe(typesBefore[1]);
        expect(types.length).toBe(typesBefore.length + 2);
    });

    it("G4: removing a node removes its rendered element", () => {
        // Insert a uniquely identifiable node, then remove it — the
        // assertion does not depend on test order or document fixtures.
        applyChange((activeState) => {
            const draft = NodeModel.createPrimalDraft({});
            draft.get("typeKey").value = "heading-3";
            const textDraft = NodeModel.createPrimalDraft({});
            textDraft.get("typeKey").value = "text";
            textDraft.get("text").value = "G4-UNIQUE-REMOVE-ME";
            draft.get("content").push(textDraft.metamorphose());
            activeState
                .get("document")
                .get("content")
                .splice(1, 0, draft.metamorphose());
        });
        expect(queryArticle(world).children[1].textContent).toContain(
            "G4-UNIQUE-REMOVE-ME",
        );
        const removedElement = queryArticle(world).children[1],
            typesBefore = articleChildTypes(world),
            expectedAfter = typesBefore.filter((_, i) => i !== 1);
        applyChange((activeState) => {
            activeState.get("document").get("content").splice(1, 1);
        });
        expect(articleChildTypes(world)).toEqual(expectedAfter);
        // The removed node's element is detached; its content is gone.
        expect(removedElement.isConnected).toBe(false);
        expect(queryArticle(world).textContent).not.toContain(
            "G4-UNIQUE-REMOVE-ME",
        );
    });

    it("G5: reordering nodes reorders the rendered elements", () => {
        // Two unique marker nodes at positions 0 and 1; move entry 1 to
        // the front. Content-level pinning makes the test independent of
        // prior model state.
        applyChange((activeState) => {
            const content = activeState.get("document").get("content");
            for (const [index, text] of [
                [0, "G5-UNIQUE-FIRST"],
                [1, "G5-UNIQUE-SECOND"],
            ]) {
                const draft = NodeModel.createPrimalDraft({});
                draft.get("typeKey").value = "heading-3";
                const textDraft = NodeModel.createPrimalDraft({});
                textDraft.get("typeKey").value = "text";
                textDraft.get("text").value = text;
                draft.get("content").push(textDraft.metamorphose());
                content.splice(index, 0, draft.metamorphose());
            }
        });
        const typesBefore = articleChildTypes(world);
        expect(queryArticle(world).children[0].textContent).toContain(
            "G5-UNIQUE-FIRST",
        );
        expect(queryArticle(world).children[1].textContent).toContain(
            "G5-UNIQUE-SECOND",
        );

        applyChange((activeState) => {
            const content = activeState.get("document").get("content"),
                [moved] = content.splice(1, 1);
            content.splice(0, 0, moved);
        });
        const types = articleChildTypes(world);
        expect(types.length).toBe(typesBefore.length);
        expect(types[0]).toBe(typesBefore[1]);
        expect(types[1]).toBe(typesBefore[0]);
        // Rendered content follows the collection order.
        expect(queryArticle(world).children[0].textContent).toContain(
            "G5-UNIQUE-SECOND",
        );
        expect(queryArticle(world).children[1].textContent).toContain(
            "G5-UNIQUE-FIRST",
        );

        // Cleanup: remove the marker nodes so later tests see a stable doc.
        applyChange((activeState) => {
            activeState.get("document").get("content").splice(0, 2);
        });
    });

    it("G6: changing a node's typeKey rebuilds its element", () => {
        // Insert a uniquely identifiable node at the front, then change
        // its typeKey — independent of prior model state.
        applyChange((activeState) => {
            const draft = NodeModel.createPrimalDraft({});
            draft.get("typeKey").value = "heading-3";
            const textDraft = NodeModel.createPrimalDraft({});
            textDraft.get("typeKey").value = "text";
            textDraft.get("text").value = "G6-UNIQUE-REBUILD";
            draft.get("content").push(textDraft.metamorphose());
            activeState
                .get("document")
                .get("content")
                .splice(0, 0, draft.metamorphose());
        });
        const oldElement = queryArticle(world).children[0];
        expect(oldElement.getAttribute("data-node-type")).toBe("heading-3");
        expect(oldElement.textContent).toContain("G6-UNIQUE-REBUILD");

        applyChange((activeState) => {
            activeState
                .get("document")
                .get("content")
                .get("0")
                .get("typeKey").value = "heading-2";
        });
        const newElement = queryArticle(world).children[0];
        expect(newElement.getAttribute("data-node-type")).toBe("heading-2");
        // The element was rebuilt (new identity) …
        expect(newElement).not.toBe(oldElement);
        // … and its content subtree re-rendered.
        expect(newElement.textContent).toContain("G6-UNIQUE-REBUILD");

        // Cleanup.
        applyChange((activeState) => {
            activeState.get("document").get("content").splice(0, 1);
        });
    });

    it("G7: text updates render; adding/removing a mark wraps/unwraps the run", () => {
        // The second top-level paragraph of the fixture starts with the
        // text run "The term typography is also applied …" — untouched by
        // the earlier tests (G6's pinned quirk emptied the first heading,
        // and G3's inserted nodes sit at the front).
        const paragraphIndex = articleChildTypes(world).indexOf("paragraph"),
            paragraph = queryArticle(world).children[paragraphIndex],
            originalText = paragraph.textContent.trim().split(/\s{2,}/)[0];
        expect(originalText.length).toBeGreaterThan(0);

        // Change that paragraph's first text run; the rendered run follows.
        const updatedText = "Behavior net updated text.";
        applyChange((activeState) => {
            const paragraphNode = activeState
                    .get("document")
                    .get("content")
                    .get(String(paragraphIndex)),
                textNode = findFirstTextNode(paragraphNode);
            textNode.get("text").value = updatedText;
        });
        expect(
            queryArticle(world).children[paragraphIndex].textContent,
        ).toContain(updatedText);

        // Add a "strong" mark to the updated run.
        applyChange((activeState) => {
            const paragraphNode = activeState
                    .get("document")
                    .get("content")
                    .get(String(paragraphIndex)),
                textNode = findFirstTextNode(paragraphNode),
                markDraft = MarkModel.createPrimalDraft({});
            markDraft.get("typeKey").value = "strong";
            textNode.get("marks").push(markDraft.metamorphose());
        });
        // PINNED QUIRK (viewer, pre-refactor): a mark added to an existing
        // text run does NOT wrap the run — it renders as bare text, while
        // marks present since ingestion (e.g. the fixture's italic "art
        // and technique" run in the same paragraph) do render their
        // wrappers. Pinned as-is; fixing is out of scope for the
        // walker/renderer separation.
        const paragraph2 = queryArticle(world).children[paragraphIndex],
            styledRuns = [...paragraph2.querySelectorAll("[data-style-name]")],
            wrappedUpdatedRun = styledRuns.find((el) =>
                el.textContent.includes(updatedText),
            );
        expect(wrappedUpdatedRun).toBeUndefined();
        expect(paragraph2.textContent).toContain(updatedText);
        // Sanity: the pre-existing styled run in this paragraph still
        // renders its wrapper (the wrap machinery itself works).
        expect(styledRuns.length).toBeGreaterThan(0);

        // Removing the mark leaves the text in place.
        applyChange((activeState) => {
            const paragraphNode = activeState
                    .get("document")
                    .get("content")
                    .get(String(paragraphIndex)),
                textNode = findFirstTextNode(paragraphNode);
            textNode.get("marks").splice(0, 1);
        });
        expect(
            queryArticle(world).children[paragraphIndex].textContent,
        ).toContain(updatedText);
    });
});
