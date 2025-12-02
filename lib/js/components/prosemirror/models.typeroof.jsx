import {
    PathModelOrEmpty,
    Path,
    _AbstractStructModel,
    _AbstractOrderedMapModel,
    _AbstractListModel,
    _AbstractEnumModel,
    StringModel,
    CoherenceFunction,
    topologicalSortKahn,
    BooleanModel,
    BooleanDefaultTrueModel,
} from "../../metamodel.mjs";

import { StringOrEmptyModel, NumberOrEmptyModel } from "../actors/models.mjs";

// I didn't find the rules for prosemirror, so I'm going for a small set
// allowing only A-Za-z0-9_\-, maybe we can be more permissive, if required for
// some case.
// TODO: for all of these, there will be reserved wont be allowed, e.g.
// because we use them in the basic Schema. Besides that, on an per use-case
// level, we might add other reserved/disallowed names. But those rather won't
// be on the model level, as it is creating many very similar types, so it
// will be rather on application/behavior level (we would just not add a
// node to the generated Schema, and inform the user).
export function validateNodeSpecName(name) {
    // I even allow white-space here, as I don't have so far hard restrictions.
    // However, the empty string is not allowed.
    if (typeof name !== "string")
        return [
            false,
            `NodeSpecName must be string but is typeof ${typeof name}.`,
        ];

    if (name.length < 1)
        return [
            false,
            `NodeSpecName must be at least 1 char long but name.length is ${name.length}. NodeSpecName: "${name}".`,
        ];

    const regexAlpha = /^[a-zA-Z0-9_-]+$/;
    if (!regexAlpha.test(name))
        return [
            false,
            `NodeSpecName must only contain a-z, A-Z, 0-9, "-", and "_" but NodeSpecName is: "${name}".`,
        ];
    return [true, null];
}
export const validateMarkSpecName = validateNodeSpecName,
    validateAttributeSpecName = validateNodeSpecName;
// A documnent model that re-creates the structures and names of the
// prosemirror-model module closely.
// https://prosemirror.net/docs/ref/#model
//
// https://prosemirror.net/docs/ref/#model.Node
//      > This class represents a node in the tree that makes up a ProseMirror
//      > document. So a document is an instance of Node, with children that
//      > are also instances of Node.
//      > Nodes are persistent data structures. Instead of changing them,
//      > you create new ones with the content you want. Old ones keep
//      > pointing at the old document shape. This is made cheaper by sharing
//      > structure between the old and new data as much as possible, which
//      > a tree shape like this (without back pointers) makes easy.
//      > Do not directly mutate the properties of a Node object. See the
//      > guide for more information.
// NOTE: the type will likeley have to be more complex, e.g. a
// Struct with type:Enum etc.
export const // We don't do  prosemirror SchemaSpec yet, but we may need it to also
    // capture some additional information about the marks:
    //  https://prosemirror.net/docs/ref/#model.SchemaSpec
    //  spec: {
    //       nodes: OrderedMap<NodeSpec>,
    //       marks: OrderedMap<MarkSpec>,
    //       topNode⁠?: string
    //  }
    AttrValidateTypeModel = _AbstractEnumModel.createClass(
        "AttrValidateTypeModel",
        [
            "no-validation",
            "number",
            "string",
            "boolean",
            "null",
            "undefined",
            "application-specific",
        ],
        "no-validation",
    ),
    AttrValidateModel = _AbstractStructModel.createClass(
        "AttrValidateModel",
        ["type", AttrValidateTypeModel],
        // NOTE: this is a stub! might become or add a ForeignKey based
        // implementation. But, if it is not a standard type, the implementation
        // will be shifted to the application (from the model), and there
        // it might be something custom. For ProseMirror it is only interesting
        // that we can produce a function using this instruction.
        ["appSpecific", StringOrEmptyModel],
        CoherenceFunction.create(
            ["type", "appSpecific"],
            function checkValues({ type, appSpecific }) {
                if (type.value === "application-specific") {
                    if (appSpecific.isEmpty) appSpecific.value = ""; // should behave like "no-validation"
                } else appSpecific.clear();
            },
        ),
    ),
    AttributeSpecModel = _AbstractStructModel.createClass(
        "AttributeSpecModel",
        // default⁠?: any
        // The default value for this attribute, to use when no explicit
        // value is provided. Attributes that have no default must be
        // provided whenever a node or mark of a type that has them is
        // created.
        // TODO: StringModel is likely not sufficient.
        // CAUTION: This should be the same type as the values AttrsMapModel of
        ["default", StringModel],
        // validate⁠?: string | fn(value: any)
        // A function or type name used to validate values of this attribute.
        // This will be used when deserializing the attribute from JSON, and
        // when running Node.check. When a function, it should raise an exception
        // if the value isn't of the expected type or shape. When a string,
        // it should be a |-separated string of primitive types ("number", "string", "boolean", "null", and "undefined"),
        // and the library will raise an error when the value is not one of those types.
        ["validate", AttrValidateModel],
    ),
    AttributeSpecMapModel = _AbstractOrderedMapModel.createClass(
        "AttributeSpecMapModel",
        AttributeSpecModel,
        { validateKeyFn: validateAttributeSpecName },
    ),
    NodeSpecModel = _AbstractStructModel.createClass(
        // https://prosemirror.net/docs/ref/#model.NodeSpec
        "NodeSpecModel",
        //  content⁠?: string
        // The content expression for this node, as described in the
        // schema guide. When not given, the node does not allow any content.⁠
        ["content", StringOrEmptyModel],
        // marks⁠?: string
        // The marks that are allowed inside of this node. May be a
        // space-separated string referring to mark names or groups, "_"
        // to explicitly allow all marks, or "" to disallow marks. When
        // not given, nodes with inline content default to allowing all
        // marks, other nodes default to not allowing marks.
        ["marks", StringOrEmptyModel],

        // group⁠?: string
        // The group or space-separated groups to which this node belongs,
        // which can be referred to in the content expressions for the schema.
        ["group", StringOrEmptyModel],

        // CAUTION: this is not part of ProseMirror model.NodeSpec
        // TODO: This should have a validation function! E.g. look at
        // FontAxisTagModel in type-dimension-fundamentals, that but
        // specialized in HTML-Tags
        ["tag", StringOrEmptyModel],

        // inline⁠?: boolean
        // Should be set to true for inline nodes. (Implied for text nodes.)
        ["inline", BooleanModel],

        // atom⁠?: boolean
        // Can be set to true to indicate that, though this isn't a leaf node,
        // it doesn't have directly editable content and should be treated as a single unit in the view.
        ["atom", BooleanModel],

        // attrs⁠?: Object<AttributeSpec>
        // The attributes that nodes of this type get.
        ["attrs", AttributeSpecMapModel],

        // selectable⁠?: boolean
        // Controls whether nodes of this type can be selected as a node selection. Defaults to true for non-text nodes.
        ["selectable", BooleanDefaultTrueModel],

        // draggable⁠?: boolean
        // Determines whether nodes of this type can be dragged without being selected. Defaults to false.
        ["draggable", BooleanModel],

        // code⁠?: boolean
        // Can be used to indicate that this node contains code, which causes some commands to behave differently.
        ["code", BooleanModel],

        // whitespace⁠?: "pre" | "normal"
        // Controls way whitespace in this a node is parsed. The default is "normal", which causes the DOM parser
        // to collapse whitespace in normal mode, and normalize it (replacing newlines and such with spaces)
        // otherwise. "pre" causes the parser to preserve spaces inside the node. When this option isn't given,
        // but code is true, whitespace will default to "pre". Note that this option doesn't influence the way
        // the node is rendered—that should be handled by toDOM and/or styling.
        // , ['whitespace', ]

        // definingAsContext⁠?: boolean
        // Determines whether this node is considered an important parent node during replace operations
        // (such as paste). Non-defining (the default) nodes get dropped when their entire content is
        // replaced, whereas defining nodes persist and wrap the inserted content.
        ["definingAsContext", BooleanModel],

        // definingForContent⁠?: boolean
        // In inserted content the defining parents of the content are preserved when possible. Typically,
        // non-default-paragraph textblock types, and possibly list items, are marked as defining.
        ["definingForContent", BooleanModel],

        // This is more like an interface thing as the two properties before
        // are set when this is used.
        // defining⁠?: boolean
        // When enabled, enables both definingAsContext and definingForContent.
        // ['defining', BooleanModel]

        // isolating⁠?: boolean
        // When enabled (default is false), the sides of nodes of this type count as boundaries that regular
        // editing operations, like backspacing or lifting, won't cross. An example of a node that should
        // probably have this enabled is a table cell.

        ["isolating", BooleanModel],
        // toDOM⁠?: fn(node: Node) → DOMOutputSpec
        // Defines the default way a node of this type should be serialized to DOM/HTML (as used by
        // DOMSerializer.fromSchema). Should return a DOM node or an array structure that describes one,
        // with an optional number zero (“hole”) in it to indicate where the node's content should be inserted.

        // For text nodes, the default is to create a text DOM node. Though it is possible to create a serializer
        // where text is rendered differently, this is not supported inside the editor, so you shouldn't override
        // that in your text node spec.
        // CAUTION: we need to implement this dynamically

        // parseDOM⁠?: readonly TagParseRule[]
        // Associates DOM parser information with this node, which can be used by DOMParser.fromSchema to
        // automatically derive a parser. The node field in the rules is implied (the name of this node will be
        // filled in automatically). If you supply your own parser, you do not need to also specify parsing rules
        // in your schema.
        // CAUTION: we need to implement this dynamically

        // toDebugString⁠?: fn(node: Node) → string
        // Defines the default way a node of this type should be serialized to a string representation for
        // debugging (e.g. in error messages).
        // CAUTION: we need to implement this dynamically

        // leafText⁠?: fn(node: Node) → string
        // Defines the default way a leaf node of this type should be serialized to a string (as used by
        // Node.textBetween and Node.textContent).
        // CAUTION: we need to implement this dynamically

        // linebreakReplacement⁠?: boolean
        // A single inline node in a schema can be set to be a linebreak equivalent. When converting between
        // block types that support the node and block types that don't but have whitespace set to "pre",
        // setBlockType will convert between newline characters to or from linebreak nodes as appropriate.
        ["linebreakReplacement", BooleanModel],

        // [string]: any
        // Node specs may include arbitrary properties that can be read by other code via NodeType.spec.
        // No need to implement this now here.
    ),
    MarkSpecModel = _AbstractStructModel.createClass(
        // https://prosemirror.net/docs/ref/#model.MarkSpec
        "MarkSpecModel",
        // attrs⁠?: Object<AttributeSpec>
        // The attributes that marks of this type get.
        ["attrs", AttributeSpecMapModel],

        // inclusive⁠?: boolean
        // Whether this mark should be active when the cursor is positioned
        // at its end (or at its start when that is also the start of
        // the parent node). Defaults to true.
        ["inclusive", BooleanDefaultTrueModel],

        // excludes⁠?: string
        // Determines which other marks this mark can coexist with. Should
        // be a space-separated strings naming other marks or groups of
        // marks. When a mark is added to a set, all marks that it excludes
        // are removed in the process. If the set contains any mark that
        // excludes the new mark but is not, itself, excluded by the new
        // mark, the mark can not be added an the set. You can use the
        // value "_" to indicate that the mark excludes all marks in the schema.
        //
        // Defaults to only being exclusive with marks of the same type.
        // You can set it to an empty string (or any string not containing
        // the mark's own name) to allow multiple marks of a given type to
        // coexist (as long as they have different attributes).
        ["excludes", StringOrEmptyModel],

        // group⁠?: string
        // The group or space-separated groups to which this mark belongs.
        ["group", StringOrEmptyModel],

        // CAUTION: this is not part of ProseMirror model.NodeSpec
        // TODO: This should have a validation function! E.g. look at
        // FontAxisTagModel in type-dimension-fundamentals, that but
        // specialized in HTML-Tags
        ["tag", StringOrEmptyModel],

        // spanning⁠?: boolean
        // Determines whether marks of this type can span multiple adjacent
        // odes when serialized to DOM/HTML. Defaults to true.
        ["spanning", BooleanDefaultTrueModel],

        // code⁠?: boolean
        // Marks the content of this span as being code, which causes some
        // commands and extensions to treat it differently.
        ["code", BooleanModel],
    ),
    // The `nodes` in prosemirror SchemaSpec are defined as OrderedMap<NodeSpec>
    // this is supposed to be one-to-one equivalent.
    NodeSpecMapModel = _AbstractOrderedMapModel.createClass(
        "NodeSpecMapModel",
        NodeSpecModel,
        { validateKeyFn: validateNodeSpecName },
    ),
    MarkSpecMapModel = _AbstractOrderedMapModel.createClass(
        "MarkSpecMapModel",
        MarkSpecModel,
        { validateKeyFn: validateMarkSpecName },
    ),
    // Each Node in the NodeSpec can be linked to one TypeSpec, this includes
    // nested TypeSpecs, i.e. children, as well.
    // In order to make it possible to generally replace the NodeSpec to
    // TypeSpec mapping, it's stored external to both structures. So,
    // TypeSpec doesn't know anything about the NodeSpec and the NodeSpec
    // doesn't know anything about the TypeSpec. Otherwise, e.g. the
    // a Node in the NodeSpec could directly link to the TypeSpecs that
    // applies to it, but that would bind the NodeSpec to the TypeSpec
    //
    // Having the nodeLink unique makes totally sense, as it's a one
    // to many linking. Ideally the keys in this map must be keys in
    // the nodeSpecMap, and since it's a map, keys are unique.
    //
    // For a ForeignKey-constraint it's only important if we e.g. would
    // want to delete the key in here, when the node doesn't exist anymore.
    // However, if the link persists a Node is not in the NodeSpec, despite
    // being linked here, the Node never gets initialized and hence never.
    // Styled, so I don't see a problem if there are dead links. It can
    // be marked in the UI creating a TODO-like item: either create a
    // NodeSpec, change the link, or delete the link. This means, we can
    // replace the NodeSpec but keep the mapping and even go back without
    // loss of information.
    //
    // Similarly the typeSpecLink (value) it can be a string actually,
    // as when the linked TypeSpec disappers, we need to get a visual hint,
    // that there's a broken link, but we don't need to delete the entry.
    // If a node is rendered with no typeSpec, we'll mark it regardless.
    // if it has a broken link we just add that information.
    // the Style-Links interface in TypeSpec propertues seems very similar,
    // it has  options for explicit NULL, custom and then for all existing
    // style Patches
    //    UIStylePatchesLinksMap with LinksMapKeyChangeSelect
    //
    // OK, so the good news is, that UIStylePatchesLinksMap exists and
    // does pretty much what we need. The bad news is that it is very
    // complex and deep and it will be some work to make it fit here.
    //
    // In that interface, the keys can be chosen freely. However, in
    // this UI the keys should be selectable from the NodeSpec, so, that's
    // a huge difference:
    // Link a [Select TypeSpec or NULL/Custom] as [Select NodeSpec or Custom]
    // The "Select NodeSpec" is not in the UIStylePatchesLinksMap.
    //
    // I need to look up the "relative" linking of TypeSpec as well.
    // i.e. a child NodeSpec would be relative to it's parent Node TypeSpec
    // when it would define ./t1 so the parent would be whatever and the
    // child then would be ./t1 of that parent type spec. We do not really
    // know that NodeSpec parent-child relation in this mapping, and in
    // the NodeSpec I believe we could have different answers to which
    // node would be a parent of which child, e.g. a NodeSpec can have
    // multiple potential parent NodeSpecs (including itself). So this
    // could only be answered finally within the document structure.
    //
    // Still, the possibility to have relative paths should create great
    // flexibility. The question is, if we can handle this and how we
    // input it. I.e. using the custom feature could be an option. We
    // could select an absolute path to a typeSpec, change to custom and
    // then make it relative from there.
    // Eventually, to make this a good feature from a UI perspective:
    //  1. It needs to become visible, as a relative path behind the custom
    //     setting, it's totally hidden. It could be documentation within
    //     the UI, at least, or some tooling, which is not initially required
    //     though. It's more important that the feature is discoverable/
    //     not a secret than that it has UI/tooling support.
    //  2. Paths need to get a normalization: "./2/children/3/children/4",
    //     should become "./2/3/4" or "/2/3/4" as the "children" particles
    //     don't add to the actual information.
    //  3. Keys of the typeSpecs must become editable, so we can add
    //     meaning to the typeSpec structure/layout and so we can create
    //     relative paths that work across typeSpecs. E.g.:
    //           /en_US/quote/paragraph
    //           /de_DE/quote/paragraph
    //     within a en_US container
    //           ./quote/paragraph
    //    could easily be changed to a "de_DE" root by changing the parent
    //    container.
    // One more consideration/advanced idea. Cross-referencing of TypeSpecs
    // is not yet supported, but a thing I think about. so we can have
    // a headline hierarchy defined once and use it within differen
    // (e.g. language) roots. Maybe, for this to make it work we want to
    // introduce typeSpec layers that make it fit, but are not intended to
    // be used as block definitions themselves. So they could be marked as
    // "shim" typeSpec. This would exclude them from normalized paths, when
    // resolving relative path parts like (../). It would not prevent those
    // shims to be actually used with an absolute path though, as well as
    // moving down a tree, they would require a pathPart, so maybe this
    // concept needs more consideration. If we can't have them as shims,
    // maybe we need to have a concept of "wraps", that don't introduce
    // new path-parts.
    //
    // Level-1 will be absolute path mapping.
    // Level-2 will allow relative path mapping.
    // 1. Keep a comment around: can be level 2
    // 2. Normalize Paths: not the most important part, can be level 3, after intial implementation
    // 3. explicit key names: should be level 2, as relative paths don't
    //    make much sense, if we can't give meaningful, explicit names.
    //
    // There could be some validation of the value strings in order to make
    // it less likely that we don't link to an actual typeSpec, but in
    // general, the not-found case is plannned into it.
    // For the keys here as well, these are the same keys as in
    NodeSpecToTypeSpecMapModel = _AbstractOrderedMapModel.createClass(
        "NodeSpecToTypeSpecMapModel",
        StringModel,
    ),
    // NOTE: I'm entirely not sure if we need this as a model, as the
    // actual Schema will be created with the original type. So far, this
    // is the home of `nodes` and it may keep more information that will
    // go into prosemirror, it may also keep information that is not
    // directly in the pm Schema, but required to decide how it is created.
    ProseMirrorSchemaModel = _AbstractStructModel.createClass(
        // https://prosemirror.net/docs/ref/#model.Schema
        "ProseMirrorSchemaModel",
        // An object mapping the schema's node names to node type objects.
        ["nodes", NodeSpecMapModel],
        ["marks", MarkSpecMapModel],
        // A map from mark names to mark type objects.
        // , ['marks', ...] we might likeley create these marks from other means
        //
        // The linebreak replacement node defined in this schema, if any.
        // , ['linebreakReplacement', NodeType]
        //
        // An object for storing whatever values modules may want to compute
        // and cache per schema. (If you want to store something in it, try
        // to use property names unlikely to clash.)
        // , ['cached', ]
    ),
    // There's no better documentation for the values of attributes than
    // the following:  https://prosemirror.net/docs/guide/#schema.attributes
    //   > Attribute sets are represented as plain objects with a predefined
    //   > (per node or mark) set of properties holding any JSON-serializeable
    //   > values. To specify what attributes it allows, use the optional attrs
    //   > field in a node or mark spec
    // https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.ts
    // We find:
    //   > // An object holding the attributes of a node.
    //   > export type Attrs = {readonly [attr: string]: any}
    // hence, the keys are strings and the values are `any` where the guide
    // says "JSON-serializeable".
    JSONTypeModel = _AbstractEnumModel.createClass(
        "JSONTypeModel",
        ["object", "array", "string", "number", "true", "false", "null"],
        "null",
    ),
    JSONModel = _AbstractStructModel.createClass(
        "JSONModel",
        ["type", JSONTypeModel],
        ["string", StringOrEmptyModel],
        ["number", NumberOrEmptyModel],
        [
            "object",
            _AbstractStructModel.WITH_SELF_REFERENCE,
            (JSONModel) =>
                _AbstractOrderedMapModel.createClass(
                    "JSONMapModel",
                    JSONModel,
                    {
                        ordering: _AbstractOrderedMapModel.ORDER.KEYS_ALPHA,
                    },
                ),
        ],
        [
            "array",
            _AbstractStructModel.WITH_SELF_REFERENCE,
            (JSONModel) =>
                _AbstractListModel.createClass("JSONListModel", JSONModel),
        ],
        CoherenceFunction.create(
            ["type", "string", "number", "object", "array"],
            function checkValues({ type, ...data }) {
                if (type.value === "string") {
                    if (data.string.isEmpty) data.string.value = "";
                } else if (type.value === "number") {
                    if (data.number.isEmpty) data.number.value = 0;
                }
                // clean up
                for (const [typeKey, item] of Object.entries(data)) {
                    if (type.value === typeKey) continue;
                    if (typeKey === "string" || typeKey === "number")
                        item.clear();
                    else if (typeKey === "object")
                        item.arraySplice(0, Infinity);
                    else if (typeKey === "array") item.splice(0, Infinity);
                    else
                        throw new Error(
                            `NOT IMPLEMENTED don't know how to empty ${typeKey}: ${item}`,
                        );
                }
            },
        ),
    ),
    AttrsMapModel = _AbstractOrderedMapModel.createClass(
        "AttrsMapModel",
        JSONModel,
        { validateKeyFn: validateAttributeSpecName },
    ),
    // https://prosemirror.net/docs/ref/#model.Mark
    // A mark is a piece of information that can be attached to a node,
    // such as it being emphasized, in code font, or a link. It has a type
    // and optionally a set of attributes that provide further information
    // (such as the target of the link). Marks are created through a Schema,
    // which controls which types exist and which attributes they have.
    MarkModel = _AbstractStructModel.createClass(
        "MarkModel",
        // The type of this mark.
        // see NOTE about typeKey in NodeModel, it also applies here.
        ["typeKey", StringModel],
        // The attributes associated with this mark.
        ["attrs", AttrsMapModel],
    ),
    MarksListModel = _AbstractListModel.createClass(
        "MarksListModel",
        MarkModel,
    ),
    NodeModel = _AbstractStructModel.createClass(
        "NodeModel",
        // The type of node that this is.
        // From https://prosemirror.net/docs/guide/
        //     > Each node is represented by an instance of the Node class. It
        //     > is tagged with a type, which knows the node's name, the attributes
        //     > that are valid for it, and so on. Node types (and mark types)
        //     > are created once per schema, and know which schema they are part of.
        // NOTE: I implement this as a reference into into the NodeSpecMapModel
        // so we could have the key name handy, and the resolved type
        // or null as well. I don't see so far how the distinction
        // NodeType <-> NodeSpec and the initialization of it would be
        // helping in here. We'll know which schema we are part of because
        // it will be linked into the node...
        // parent must provide proseMirrorNodeSpecMap:NodeSpecMapModel
        // FIXME/TODO: this could be a ForeignKey, we could then get
        // type as a ValueLink to read directly from here. However,
        // Metamodel thinks to detect a circular dependency, which might
        // be fixable or was caused by improper usage. Eventually,
        // we have to handle missing links gracefully in any case and
        // without losing the key-name, thus, a foreign key constraint
        // is also more complicated than just a string.
        // , ['nodeSpecMap', new InternalizedDependency('proseMirrorNodeSpecMap', NodeSpecMapModel)]
        // , ['typeKey', new ForeignKey('nodeSpecMap', ForeignKey.ALLOW_NULL, ForeignKey.NO_ACTION)]
        // , ['type', new ValueLink('typeKey')]
        ["typeKey", StringModel],
        // An object mapping attribute names to values. The kind of attributes
        // allowed and required are determined by the node type.
        ["attrs", AttrsMapModel],
        // The marks (things like whether it is emphasized or part of a link)
        // applied to this node.
        ["marks", MarksListModel],
        // For text nodes, this contains the node's text content.
        ["text", StringOrEmptyModel],
        // Fragment
        // => List of of NodeModel (we want to use the keys as paths)
        // https://prosemirror.net/docs/ref/#model.Fragment
        //      > A fragment represents a node's collection of child nodes.
        //      > Like nodes, fragments are persistent data structures,
        //      > and you should not mutate them or their content. Rather,
        //      > you create new instances whenever needed. The API tries to
        //      > make this easy.
        // NOTE: the prosemirror docs describe more api than we add to the
        // class, we may just implement similar functions.
        [
            "content",
            _AbstractStructModel.WITH_SELF_REFERENCE,
            (NodeModel) =>
                _AbstractListModel.createClass("FragmentModel", NodeModel),
        ],
        // NOTE: Skipping 'children' the difference between 'content' and
        // 'children' is not  relevant for this case. We even implement
        // FragmentModel as a _AbstractListModel of NodeModel which is as
        // equivalent to this type definition of "Node[]" as it gets. I
        // think the ProseMirror FragmentModel is just a more powerful
        // abstraction to Node[], with more API than a simple list, and this
        // children: Node[] can cheaply be implemented as a reference to
        // children = node.content.content. I.e. if our FragmentModel would
        // become a struct, we could create a Link to it's children here.
        // A container holding the node's children.
        // children: readonly Node[]
    );

export function fromMetaModelJSON(value) {
    const type = value.get("type").value;
    if (type === "true") return true;
    else if (type === "false") return false;
    else if (type === "null") return null;
    else if (type === "string" || type === "number")
        return value.get(type).value;
    else if (type === "array")
        return Array.from(value.get(type).value).map(fromMetaModelJSON);
    else if (type === "object")
        return Object.fromEntries(
            Array.from(value.get(type)).map(([key, value]) => [
                key,
                fromMetaModelJSON(value),
            ]),
        );
    else
        throw new Error(
            `NOT IMPLEMENTED don't know how to handle type "${type}"`,
        );
}

export function toMetaModelJSON(value, dependencies = {}) {
    const draft = JSONModel.createPrimalDraft(dependencies),
        type = draft.get("type"),
        jsType = typeof value;
    if (value === true) type.value = "true";
    else if (value === false) type.value = "false";
    else if (value === null) type.value = "null";
    else if (jsType === "string" || jsType === "number") {
        type.value = jsType;
        draft.get(jsType).value = value;
    } else if (jsType === "object" && Array.isArray(value)) {
        type.value = "array";
        draft
            .get("array")
            .push(...value.map((val) => toMetaModelJSON(val, dependencies)));
    } else if (jsType === "object") {
        type.value = "object";
        draft
            .get("object")
            .push(
                ...Object.entries(value).map(([k, val]) => [
                    k,
                    toMetaModelJSON(val, dependencies),
                ]),
            );
    } else
        throw new Error(
            `NOT IMPLEMENTED don't know how to handle value ${value.toString()}:${jsType}`,
        );
    return draft.metamorphose();
}
// Quick test of the above:
// console.log(fromMetaModelJSON(toMetaModelJSON({
//     a: [1,2,3,{b:4,c:5}],
//     bool: true,
//     bool2: false,
//     num: 123.345,
//     null: null,
//     obj: {x: [1,2,true, false, null, {y:'YYY'}]}
// }, {})));
