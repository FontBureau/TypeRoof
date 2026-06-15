import { loadWikipediaPage } from "../../lib/js/converters/wikipedia";

import {
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../../lib/js/metamodel/metamodel.ts";

// @ts-expect-error Waiting Typescript migration
import { NodeModel } from "../../lib/js/components/prosemirror/models.typeroof.jsx";

const form = document.getElementById("form");
const code = document.getElementById("code");

form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const title = formData.get("title")?.toString();
    const result = await loadWikipediaPage(title!);
    code!.textContent = JSON.stringify(result);
    console.log(result);

    const dependencies = {};
    const serializeOptions = Object.assign({}, SERIALIZE_OPTIONS, {
        format: SERIALIZE_FORMAT_OBJECT,
    });
    const nodes = deserializeSync(
        NodeModel,
        dependencies,
        result,
        serializeOptions,
    );

    console.log(nodes);
});
