export async function loadWikipediaPage(title: string) {
    const url = `https://en.wikipedia.org/w/rest.php/v1/page/${title}/html`;
    return fetch(url)
        .then((response) => response.text())
        .then((contents) => {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(contents, "text/html");
            const result = convertDocument(newDoc);
            return result;
        });
}

////////////////////////////////////////////////////////////////////////////////
// types

type MarkAttribute = [
    string,
    {
        type: string;
        string: string;
    },
];

type Mark = {
    typeKey: string;
    attrs: MarkAttribute[];
};

type Result =
    | {
          typeKey: string;
          content: Result[];
      }
    | {
          typeKey: string;
          text: string;
          marks?: Mark[];
      };

////////////////////////////////////////////////////////////////////////////////
// functions

function convertDocument(doc: Document): Result {
    const result1 = convertNode(doc.body);
    if (result1 === null) throw new Error("Unexpected result: null.");
    if (Array.isArray(result1)) throw new Error("Unexpected result: array.");

    const result2 = wrapTextNodes(result1);
    return result2;
}

function convertNode(node: ChildNode): Result | Result[] | null {
    switch (node.nodeType) {
        case Node.ELEMENT_NODE: {
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            if (isHidden(element)) return null;
            if (shouldSkip(tagName)) return null;

            // TODO convert links to <a> tags
            // TODO handle nested marks, e.g.: <sup><a>...</a></sup>
            if (isMark(tagName) && node.textContent) {
                return {
                    typeKey: "text",
                    text: node.textContent,
                    marks: getMarks(tagName),
                };
            }

            const content = Array.from(node.childNodes)
                .flatMap((child) => convertNode(child))
                .filter((child) => child !== null);

            // div and spans don't have semantic value, so we skip them and
            // keep their children. The following returns a Result[] that is
            // flattened when the parent node calls `flatMap` above.
            if (shouldSkipAndKeepChildren(tagName)) {
                return content.length === 0 ? null : content;
            }

            const typeKey = convertTagNameToTypeKey(tagName);
            return content.length === 0 ? null : { typeKey, content };
        }

        case Node.TEXT_NODE: {
            const text = node.textContent ?? "";
            const textWithoutNewlines = text.replaceAll("\n", "");
            return textWithoutNewlines.length === 0
                ? null
                : { typeKey: "text", text };
        }

        default: {
            return null;
        }
    }
}

// This is only needed to render with ProseMirror. In ProseMirror, nodes can
// only have block or inline children, not both (block and inline). This
// function wraps text nodes into <span> tags to work around this limitation.
function wrapTextNodes(result: Result): Result {
    if ("text" in result) {
        return result;
    }

    const { typeKey, content } = result;
    return {
        typeKey,
        content: content.map((child) => {
            return child.typeKey === "text" && mustHaveBlockChildren(typeKey)
                ? { typeKey: "span", content: [child] }
                : wrapTextNodes(child);
        }),
    };
}

////////////////////////////////////////////////////////////////////////////////
// utils

const isHidden = (element: HTMLElement) =>
    element.hidden ||
    element.style.display === "none" ||
    element.className.includes("hidden");

const isBold = (tagName: string) => ["b", "strong"].includes(tagName);

const isItalic = (tagName: string) => ["em", "i"].includes(tagName);

const isMark = (tagName: string) =>
    isBold(tagName) ||
    isItalic(tagName) ||
    ["a", "abbr", "bdi", "cite", "code", "small", "sup"].includes(tagName);

const shouldSkip = (tagName: string) =>
    ["link", "meta", "style"].includes(tagName);

const shouldSkipAndKeepChildren = (tagName: string) =>
    ["div", "span"].includes(tagName);

const getMarks = (tagName: string): Mark[] => [
    {
        typeKey: "generic-style",
        attrs: [
            [
                "data-style-name",
                {
                    type: "string",
                    string: getMarkName(tagName),
                },
            ],
        ],
    },
];

const getMarkName = (tagName: string): string => {
    if (isBold(tagName)) return "bold";
    if (isItalic(tagName)) return "italic";
    if (tagName === "a") return "link";
    return tagName;
};

const convertTagNameToTypeKey = (tagName: string): string => {
    const dict: Record<string, string> = {
        body: "doc",
        h1: "heading-1",
        h2: "heading-2",
        h3: "heading-3",
        h4: "heading-4",
        h5: "heading-5",
        h6: "heading-6",
        p: "paragraph",
    };
    return dict[tagName] ?? tagName;
};

const mustHaveBlockChildren = (typeKey: string) =>
    [
        "section",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "ul",
        "ol",
        "li",
    ].includes(typeKey);
