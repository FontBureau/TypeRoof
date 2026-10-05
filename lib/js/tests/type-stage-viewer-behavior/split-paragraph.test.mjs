// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { StateComparison } from "../../metamodel.mjs";
import { NodeModel } from "../../components/prosemirror/models.typeroof.jsx";
import {
    buildWorld,
    TYPE_STAGE_DEFAULT_STATE,
} from "../type-stage-toggles/harness.mjs";

const queryArticle = (world) =>
    world.zones.get("layout").querySelector("article.typeroof-document");

describe("viewer paragraph split", () => {
    let world, state;
    beforeAll(async () => {
        world = await buildWorld({
            defaultState: TYPE_STAGE_DEFAULT_STATE,
            useDefaultDocument: true,
        });
        state = world.getState();
        const draft = state.getDraft();
        draft.get("activeState").get("documentRendererMode").value = "compare";
        const next = draft.metamorphose();
        world.setState(next);
        world.root.update(new StateComparison(state, next));
        state = next;
    });

    it("keeps inserted T1 and shifted T2 styling distinct", () => {
        const draft = state.getDraft(),
            content = draft
                .get("activeState")
                .get("document")
                .get("content")
                .get(0)
                .get("content"),
            inserted = NodeModel.createPrimalDraft({}),
            text = NodeModel.createPrimalDraft({});
        inserted.get("typeKey").value = "paragraph";
        text.get("typeKey").value = "text";
        text.get("text").value = "SPLIT-T1";
        inserted.get("content").push(text.metamorphose());
        content.splice(4, 0, inserted.metamorphose());
        const next = draft.metamorphose();
        world.setState(next);
        world.root.update(new StateComparison(state, next));
        state = next;

        const elements = [
                ...queryArticle(world).querySelectorAll("[data-node-type]"),
            ],
            splitT1 = elements.find(
                (element) =>
                    element.dataset.nodeType === "paragraph" &&
                    element.textContent.includes("SPLIT-T1"),
            ),
            shiftedT2 = elements.find(
                (element) =>
                    element.dataset.nodeType === "paragraph-2" &&
                    element.textContent.includes("Johannes Gutenberg"),
            );
        expect(splitT1.dataset.nodeType).toBe("paragraph");
        expect(shiftedT2.dataset.nodeType).toBe("paragraph-2");
        const controller = world.root.getWidgetById("typeStageController"),
            handler =
                controller.widgetBus.wrapper.getProtocolHandlerImplementation(
                    "nodeProperties@",
                ),
            properties = handler
                .getRegistered(
                    "nodeProperties@/activeState/document/content/0/content/4",
                )
                .nodeProperties.getProperties();
        expect(properties.get("generic/fontSize")).toBeCloseTo(18);
        expect(Number.parseFloat(splitT1.style.fontSize)).toBeCloseTo(18);
        expect(Number.parseFloat(shiftedT2.style.fontSize)).toBeCloseTo(14);
        expect(splitT1.style.fontSize).not.toBe(shiftedT2.style.fontSize);
    });
});
