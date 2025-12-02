import { Path } from "../../metamodel.mjs";

import {
    NodeModel,
    toMetaModelJSON,
    fromMetaModelJSON,
} from "./models.typeroof.jsx";

import { _BaseComponent } from "../basics.mjs";

import { Schema /*, DOMParser*/ } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { undo, redo, history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
    baseKeymap,
    chainCommands,
    newlineInCode,
    createParagraphNear,
    liftEmptyBlock,
    splitBlockAs,
    exitCode,
} from "prosemirror-commands";
import "prosemirror-view/style/prosemirror.css";

export function getPathOfTypes(
    path /* { path } = resolved */,
    currentType = null,
) {
    // path is actually a rather complex array type:
    // path.push(node, index, start + offset).
    // This means we can get just each index out of it and that
    // it gives the raw indexes, compatible with the metamodel indexes.
    // Using the node positions is however complicated, as at the
    // time this code runs, the positions are not necessarily already
    // synced to the metamodel document.
    // Path of types is however all we need to resolve the TypeSpec.
    const pathOfTypes = [];
    // , contentIndexes = []
    for (let i = 0, l = path.length; i < l; i += 3)
        pathOfTypes.push(path[i].type.name);
    // contentIndexes.push(path[i+1]);

    if (currentType) pathOfTypes.push(currentType);
    return pathOfTypes;
}

class ProsemirrorNodeView {
    // the args are from https://prosemirror.net/docs/ref/#view.NodeViewConstructor
    // type NodeViewConstructor = fn(
    //     node: Node,
    //     view: EditorView,
    //     getPos: fn() → number | undefined,
    //     decorations: readonly Decoration[],
    //     innerDecorations: DecorationSource
    // ) → NodeView
    constructor(widgetBus, subscriptionsId, node, view, getPos) {
        this.widgetBus = widgetBus;
        this._subscriptionsId = subscriptionsId;
        // TODO: a more direct API in widgetBus for this wouldn't hurt
        // e.g. getTagForType
        const mmNodeSpec = this.widgetBus
                .getLinked(node.type.schema)
                .get("nodes")
                .get(node.type.name),
            tag = mmNodeSpec.get("tag").value,
            element = widgetBus.domTool.createElement(tag, {
                "data-node-type": node.type.name,
            });
        // The outer DOM node that represents the document node.
        this.dom = element;

        // FIXME: depending on the type of the outer node, this might
        // better be a span.
        const contentElement = widgetBus.domTool.createElement("div");
        element.append(contentElement);
        // For the subscription it is important that this element is
        // the same as the contentDOM, the element that will be the parent
        // of the marks.
        this._stylerDOM = contentElement;
        // The DOM node that should hold the node's content
        // this is probably only required when this._stylerDOM != this.dom
        // this is also part of the ProseMiror API
        this.contentDOM = contentElement;
        const subscriptionsWidget = widgetBus.getWidgetById(
            this._subscriptionsId,
            null,
        );
        if (subscriptionsWidget === null) return;
        // else: we have a subscriptions widget, hence, we can subscribe...
        const structuralElements = {
            // required to style e.g. the margins between paragraphs
            outer: this.dom,
            inner: this._stylerDOM,
        };
        // https://prosemirror.net/docs/ref/#model.ResolvedPos
        // https://prosemirror.net/docs/ref/#model.Node.resolve
        // we don't actually need to know the node position, but we
        // care about the TypeSpec of it and possibly of it's parents types
        const resolved = view.state.doc.resolve(getPos()),
            pathOfTypes = getPathOfTypes(resolved.path, node.type.name);
        subscriptionsWidget.subscribe(
            this._stylerDOM,
            pathOfTypes,
            structuralElements /*, contentIndexes*/,
        );
    }

    // // I dont't think implementing `update` is required so far.
    // update(node, ...args) {
    //     console.log(`${this.constructor.name} update`, node.type.name, 'other args:', ...args, 'this.dom.textContent:', this.dom.textContent);
    //     // if (node.content.size > 0) this.dom.classList.remove("empty")
    //     // else this.dom.classList.add("empty")
    //     return true;
    // }
    destroy() {
        this.widgetBus
            .getWidgetById(this._subscriptionsId, null)
            ?.unsubscribe(this._stylerDOM);
    }
}

class ProsemirrorMarkView {
    // https://prosemirror.net/docs/ref/#view.MarkViewConstructor
    // type MarkViewConstructor = fn(
    //     mark: Mark,
    //     view: EditorView,
    //     inline: boolean
    // ) → MarkView
    // The function types used to create mark views.
    constructor(widgetBus, subscriptionsId, mark /*, view, inline*/) {
        this.widgetBus = widgetBus;
        this._subscriptionsId = subscriptionsId;
        // TODO: a more direct API in widgetBus for this wouldn't hurt
        // e.g. getTagForType
        const // mmNodeSpec = this.widgetBus.getLinked(node.type.schema).get('nodes').get(node.type.name)
            tag = "span",
            element = widgetBus.domTool.createElement(tag, {
                "data-style-name": mark.attrs["data-style-name"],
            });
        this.dom = element;
        this._stylerDOM = element;
        this.contentDOM = element;

        const subscriptionsWidget = widgetBus.getWidgetById(
            this._subscriptionsId,
            null,
        );
        if (subscriptionsWidget === null) return;
        subscriptionsWidget.subscribeMark(this._stylerDOM, mark);
    }
    destroy() {
        this.widgetBus
            .getWidgetById(this._subscriptionsId, null)
            ?.unsubscribeMark(this._stylerDOM);
    }
}

class ProseMirrorMenuView {
    constructor(widgetBus, view /*EditorView*/, menuID) {
        this.widgetBus = widgetBus;
        this.menuID = menuID;
        this.widgetBus.getWidgetById(this.menuID).updateView(view);
    }
    update(view /*EditorView*/, prevState /*:EditorState*/) {
        this.widgetBus.getWidgetById(this.menuID).updateView(view, prevState);
    }
    destroy() {
        this.widgetBus.getWidgetById(this.menuID, null)?.destroyView();
    }
}

function mapSetBiDirectional(map, valA, valB) {
    map.set(valA, valB);
    map.set(valB, valA);
}

export function createProseMirrorSchemaFromMetaModel(
    /*SchemaSpec: */ proseMirrorDefaultSchema,
    /*ProseMirrorSchemaModel*/ proseMirrorSchema,
) {
    const schemaSpec = {
        nodes: {
            /*later: ...proseMirrorDefaultSchema.nodes*/
        },
        marks: {
            /*later:...proseMirrorDefaultSchema.marks*/
        },
    };
    for (const [name, nodeSpec] of proseMirrorSchema.get("nodes")) {
        if (name in proseMirrorDefaultSchema.nodes) {
            console.warn(
                `PROSEMIRROR NODE_SPEC: attempt to override reserved node name ${name}, SKIPPING.`,
            );
            continue;
        }
        const newNode = {};
        for (const [key, value] of nodeSpec) {
            if (key === "attrs") {
                console.warn(
                    `PROSEMIRROR SKIPPING nodeSpec property "${key}" in dynamic schema definition`,
                );
                continue;
            }
            if (value.isEmpty) continue;
            if (key === "tag") continue;
            // => for 1:1 mappings
            newNode[key] = value.value;
        }

        const tag = nodeSpec.get("tag");
        if (tag.isEmpty || tag.value === "") {
            console.warn(
                `PROSEMIRROR NODE_SPEC: node does not define a tag, node name "${name}"`,
            );
        } else {
            // NOTE: this does not at all control any collisions of
            // tag names! E.g. when two nodes use the tag-name p
            newNode.parseDOM = [{ tag: tag.value }];
            newNode.toDOM = () => {
                return [tag.value, 0];
            };
        }
        schemaSpec.nodes[name] = newNode;
    }
    // Adding the proseMirrorDefaultSchema nodes after our nodes.
    // This way, the default node, e.g., when splitting (using the "Enter" key),
    // will not be "unknown", but the first in our definition.
    // However, we won't be able to override the defaults either,
    // can also be regarded as a feature.
    Object.assign(schemaSpec.nodes, proseMirrorDefaultSchema.nodes);

    // CAUTION: this is a stub marks will be handled very differently, likely!
    // In this case it would be better to just ignore any defined marks.
    for (const [name, markSpec] of proseMirrorSchema.get("marks")) {
        if (name in proseMirrorDefaultSchema.marks) {
            console.warn(
                `PROSEMIRROR MARK_SPEC: attempt to override reserved mark name ${name}, SKIPPING.`,
            );
            continue;
        }
        const newMark = {};
        for (const [key, value] of markSpec) {
            if (key === "attrs") {
                console.warn(
                    `PROSEMIRROR SKIPPING markSpec property "${key}" in dynamic schema definition`,
                );
                continue;
            }
            if (value.isEmpty) continue;
            if (key === "tag") continue;
            // => for 1:1 mappings
            newMark[key] = value.value;
        }
        const tag = markSpec.get("tag");
        if (tag.isEmpty || tag.value === "") {
            console.warn(
                `PROSEMIRROR MARK_SPEC: mark does not define a tag, mark name: "${name}"`,
            );
        } else {
            // NOTE: this does not at all control any collisions of
            // tag names! E.g. when two nodes use the tag-name p
            newMark.parseDOM = [{ tag: tag.value }];
            newMark.toDOM = () => {
                return [tag.value, 0];
            };
        }
        schemaSpec.marks[name] = newMark;
    }
    Object.assign(schemaSpec.marks, proseMirrorDefaultSchema.marks);
    return new Schema(schemaSpec);
}

// Is this a Mac? Test used in proseMirror examples/sources e.g. in
// https://github.com/ProseMirror/prosemirror-example-setup
const mac =
    typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false;

export class ProseMirror extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="prosemirror-host"></div>`;
    //jshint ignore:end
    constructor(
        widgetBus,
        /*SchemaSpec: */ proseMirrorDefaultSchema,
        idMap = {},
    ) {
        super(widgetBus);
        this._idMap = idMap;
        this._proseMirrorDefaultSchema = proseMirrorDefaultSchema;
        // The cache is bi-directional, meaning that both mappings will be
        // set: proseMirrorNode -> metamodelNode and metamodelNode ->
        // proseMirrorNode, using mapSetBiDirectional. Since there's always
        // a one to one relationship, a single map is sufficient.
        this._nodesCache = new WeakMap();

        this._childrenWidgetBus = Object.assign(
            Object.create(widgetBus), // don't copy, inherit ...
            // By the time this gets called, the link is already established.
            // TODO: could fail on a cache-miss, as it would be bad if
            // the assertion above is not true!
            { getLinked: (item) => this._nodesCache.get(item) },
        );

        this._createGenericNodeView = (...args) =>
            new ProsemirrorNodeView(
                this._childrenWidgetBus,
                this._idMap.subscriptions,
                ...args,
            );
        this._createGenericMarkView = (...args) =>
            new ProsemirrorMarkView(
                this._childrenWidgetBus,
                this._idMap.subscriptions,
                ...args,
            );
        [this.element, this.view] = this.initTemplate();
    }

    _menuPlugin() {
        return new Plugin({
            // pluginSpec
            // => PluginView {
            //      update⁠?: fn(view: EditorView, prevState: EditorState)
            //      destroy⁠?: fn()
            //}
            view: (editorView) =>
                new ProseMirrorMenuView(
                    this._childrenWidgetBus,
                    editorView,
                    this._idMap.menu,
                ),
        });
    }

    destroy() {
        if (this.view && !this.view.isDestroyed) this.view.destroy();
    }

    _initProseMirrorView(element) {
        const initialSchema = {
                nodes: { ...this._proseMirrorDefaultSchema.nodes },
                marks: { ...this._proseMirrorDefaultSchema.marks },
            },
            schema = new Schema(initialSchema),
            // FIXME: splitBlockAs without a function as argument is the
            // same as the default splitBlock. However, I leave this in here
            // because this is the door to a feature where we could define
            // which block is inserted after another block, when we press
            // "Enter" at the end of a block. Currently, the first block
            // that is appliable in the NodeSpec-Map is used, e.g. if
            // "heading-1" is at the top, that will be created.
            // It would be cool, to optionally, and dynamically via the UI,
            // define e.g. the follow-up block of 'heading-1' is 'paragraph-1'
            // and the follow-up block of 'paragraph-1' is 'paragraph-2',
            // making the writing and editing experience more fluid.
            // Ideally, an author of a document would be able to do this,
            // but having it as the author of the nodeSpec is not too
            // bad either, and in the beginning, these roles won't be
            // separated by the tool. Later maybe there's a writing
            // tool which doesn't allow changing the nodeSpec.
            mySplitBlock = splitBlockAs(),
            // Leaving this a s a quick way back into the topic...
            //node => {
            //  console.log('splitBlock node:', node);
            //  return {type: node.type/*.schema.nodes['heading-3']*//*, attrs: {level: 2}*/}
            //}
            configureBr = () => {
                const keyMap = {};
                // The node named "hard_break" codes this behavior, this is purely
                // bound to the name, there's no detail about the implementation of
                // hard_break, however, in the proseMirror sources, the implementation
                // is given, and that is assumed here.
                //
                // The actual node type is only available in the final schema
                // hence we check again in the actual command if hard_break
                // is there and fail hard if not.
                const name = "hard_break";
                if (name in this._proseMirrorDefaultSchema.nodes) {
                    const brCommand = chainCommands(
                        exitCode,
                        (state, dispatch) => {
                            const br = state.schema.nodes[name];
                            if (!br)
                                throw new Error(
                                    `ASSUMPTION FAILED the node type ${name} ` +
                                        `is expected to be available in the schema.`,
                                );
                            // NOTE: a way to fail gracefully would be to
                            // return false, then nothing happens or the
                            // input could be taken up by a following
                            // command, but this is currently not expected,
                            // and a hard fail forces for more discipline.
                            // return false;
                            dispatch(
                                state.tr
                                    .replaceSelectionWith(br.create())
                                    .scrollIntoView(),
                            );
                            return true;
                        },
                    );
                    keyMap["Mod-Enter"] = brCommand;
                    keyMap["Shift-Enter"] = brCommand;
                    if (mac) keyMap["Ctrl-Enter"] = brCommand;
                }
                return keyMap;
            },
            typeRoofKeymap = Object.assign({}, baseKeymap, {
                // original implementation is in prosemirror-commands
                Enter: chainCommands(
                    newlineInCode,
                    createParagraphNear,
                    liftEmptyBlock,
                    mySplitBlock,
                ),
                ...configureBr(),
            }),
            state = EditorState.create({
                schema: schema,
                plugins: [
                    history(),
                    keymap({
                        "Mod-z": undo,
                        "Mod-y": redo,
                        //    , "Mod-b": toggleMark(proseMirrorTestingSchema.marks.strong)
                        //    , "Mod-B": toggleMark(proseMirrorTestingSchema.marks.strong)
                    }),
                    keymap(typeRoofKeymap),
                    ...("menu" in this._idMap ? [this._menuPlugin()] : []),
                ],
                doc: schema.topNodeType.createAndFill(),
            }),
            view = new EditorView(element, {
                state,
                dispatchTransaction:
                    this._prosemirrorDispatchTranscation.bind(this),
                markViews: {
                    "generic-style": this._createGenericMarkView,
                },
            });
        return view;
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ),
            element = frag.firstElementChild;
        this._insertElement(element);
        const view = this._initProseMirrorView(element);
        return [element, view];
    }

    _rawCreateMetamodelNode(cacheMap /* null or a map*/, pmNode, dependencies) {
        const draft = NodeModel.createPrimalDraft(dependencies),
            typeName =
                pmNode.type.name === "unknown" && "unknown-type" in pmNode.attrs
                    ? pmNode.attrs["unknown-type"]
                    : pmNode.type.name;
        draft.get("typeKey").value = typeName;
        if (pmNode.type.name === "text") {
            draft.get("text").value = pmNode.text;
        } else {
            const contentDraft = draft.get("content");
            for (let i = 0, l = pmNode.content.childCount; i < l; i++) {
                const pmChildNode = pmNode.content.child(i);
                contentDraft.push(
                    this._createMetamodelNode(
                        cacheMap,
                        pmChildNode,
                        dependencies,
                    ),
                );
            }
        }

        const marksDraft = draft.get("marks");
        for (const mark of pmNode.marks) {
            const markDraft =
                marksDraft.constructor.Model.createPrimalDraft(dependencies);
            markDraft.get("typeKey").value = mark.type.name;
            const attrsDraft = markDraft.get("attrs");
            for (const [name, value] of Object.entries(mark.attrs)) {
                attrsDraft.set(name, toMetaModelJSON(value, dependencies));
            }
            marksDraft.push(markDraft);
        }
        const attrsDraft = draft.get("attrs");
        for (const [name, value] of Object.entries(pmNode.attrs)) {
            if (
                pmNode.type.name === "unknown" &&
                name === "unknown-type" &&
                typeName !== "unknown"
            )
                // Only skip this value if we actually transferred it
                // to the type of the node (typeName).
                continue;
            attrsDraft.set(name, toMetaModelJSON(value, dependencies));
        }
        const immutableNode = draft.metamorphose();
        return immutableNode;
    }

    _rawCreateProseMirrorNode(
        cacheMap /* null or a map*/,
        metamodelNode,
        schema,
    ) {
        const type = metamodelNode.get("typeKey").value;
        let newNode;

        const marks = [];
        for (const [, mmMark] of metamodelNode.get("marks")) {
            // schema.mark(type: string | MarkType, attrs⁠?: Attrs) → Mark
            // Create a mark with the given type and attributes.
            const mmAttrs = mmMark.get("attrs");
            let attrs = null;
            if (mmAttrs.size) {
                attrs = {};
                for (const [name, value] of mmAttrs)
                    attrs[name] = fromMetaModelJSON(value);
            }
            const mark = schema.mark(mmMark.get("typeKey").value, attrs);
            marks.push(mark);
        }

        if (type === "text") {
            let text = metamodelNode.get("text");
            if (text.isEmpty || text.value.lenght === 0) {
                // This could could be handled by a CoherenceFunction function,
                // cleaning up the node before creation.
                // TODO: I'm undecided how to handle this, however, it
                // would be much nicer if this method could always return
                // something workable.
                throw new Error(`${this} text can't be empty`);
                // console.error(`${this} text can't be empty`);
                // text = {value: '<<Cannot be empty!!!>>'};
            }

            // https://prosemirror.net/docs/ref/#model.Schema.text
            // text(text: string, marks⁠?: readonly Mark[]) → Node
            // Create a text node in the schema. Empty text nodes are not allowed.
            newNode = schema.text(text.value, marks);
        } else {
            const mmContent = metamodelNode.get("content"),
                content = [];
            for (const [, /*index*/ mmChildNode] of mmContent) {
                const child = this._createProseMirrorNode(
                    cacheMap,
                    mmChildNode,
                    schema,
                );
                content.push(child);
            }
            // https://prosemirror.net/docs/ref/#model.Schema.node
            //  node(
            //      type: string | NodeType,
            //      attrs⁠?: Attrs | null = null,
            //      content⁠?: Fragment | Node | readonly Node[],
            //      marks⁠?: readonly Mark[]
            //  ) → Node
            // Create a node in this schema. The type may be a string or
            // a NodeType instance. Attributes will be extended with defaults,
            // content may be a Fragment, null, a Node, or an array of nodes.

            // NOTE: if the type is unknown to the schema, I think we should
            // create an on-the-fly placeholder that can represent the node
            // and gives a clear message, that the type is missing.
            // We'll see how feasible that will be!

            const mmAttrs = metamodelNode.get("attrs");
            let attrs = null;
            if (mmAttrs.size) {
                attrs = {};
                for (const [name, value] of mmAttrs) {
                    attrs[name] = fromMetaModelJSON(value);
                }
            }

            // An alternative would be to create a type on the fly,
            // but that would require to update the schema, which at
            // this point is a bit late. We could pre-detect missing
            // node types as well, but we would have to do it on each
            // update. I think this route has the least impact.
            // However, we have a problem as we cannot have a node
            // allowing both: inline and block content!
            let pmTypeName = type;
            if (!(type in schema.nodes)) {
                //schema.node(type)
                pmTypeName = "unknown";
                // caution: this attr should not be put into the metamodel!
                if (attrs === null) attrs = {};
                attrs["unknown-type"] = type;
            }
            newNode = schema.node(pmTypeName, attrs, content, marks);
        }
        return newNode;
    }

    /**
     * If caching is to be used inject cache here, i.e. use this._nodesCache
     * or maybe a new Map() to cache internal node creation, the latter
     * is likely not a very good optimization as document would have to
     * contain a lot of identical nodes for it to speed things up.
     * The former, however, is crucial to keep the identity of the
     * metamodel <-> prosemirror nodes in sync.
     */
    _createMetamodelNode(cacheMap /* null or a map*/, pmNode, dependencies) {
        if (cacheMap !== null && cacheMap.has(pmNode))
            return cacheMap.get(pmNode);

        const immutableNode = this._rawCreateMetamodelNode(
            cacheMap,
            pmNode,
            dependencies,
        );

        if (cacheMap !== null)
            mapSetBiDirectional(cacheMap, pmNode, immutableNode);
        return immutableNode;
    }

    /**
     * If caching is to be used inject cache here, i.e. use this._nodesCache
     * or maybe a new Map() to cache internal node creation, the latter
     * is likely not a very good optimization as document would have to
     * contain a lot of identical nodes for it to speed things up.
     * The former, however, is crucial to keep the identity of the
     * metamodel <-> prosemirror nodes in sync.
     */
    _createProseMirrorNode(cacheMap /* null or a map*/, metamodelNode, schema) {
        if (cacheMap !== null && cacheMap.has(metamodelNode))
            return cacheMap.get(metamodelNode);

        const newNode = this._rawCreateProseMirrorNode(
            cacheMap,
            metamodelNode,
            schema,
        );

        if (cacheMap !== null)
            mapSetBiDirectional(cacheMap, metamodelNode, newNode);
        return newNode;
    }

    _prosemirrorDispatchTranscation(transaction) {
        // console.log(
        //   `${this} DISPATCH_TRANSACTION size went from`,
        //   transaction.before.content.size,
        //   "to",
        //   transaction.doc.content.size,
        //   "\ntransaction:",
        //   transaction,
        // );

        const newState = this.view.state.apply(transaction);
        const document = this.getEntry("document"); // => immutableDoc
        this.view.updateState(newState);
        const pmDocNode = this._nodesCache.get(document);
        if (pmDocNode === this.view.state.doc) {
            // nothing to do
            // console.log(`${this} DISPATCH_TRANSACTION: nothing to do`);
        } else {
            // console.log(
            //   `${this} DISPATCH_TRANSACTION: update metamodel document with view.state.doc...`,
            // );
            // update/sync metamodel document with view.state.doc
            // eventually:
            this._changeState(() => {
                const documentDraft = this.getEntry("document"),
                    pmDoc = this.view.state.doc,
                    // creating the doc will also create all the child nodes.
                    immutableDoc = this._createMetamodelNode(
                        this._nodesCache,
                        pmDoc,
                        documentDraft.oldState.dependencies,
                    ),
                    documentPath = Path.fromString(
                        this.widgetBus.getExternalName("document"),
                    ),
                    documentParentDraft = this.getEntry(documentPath.parent),
                    dokumentKey = documentPath.parts.at(-1);
                documentParentDraft.set(dokumentKey, immutableDoc);
                this._nodesCache.set(immutableDoc, this.view.state.doc);
                mapSetBiDirectional(
                    this._nodesCache,
                    immutableDoc,
                    this.view.state.doc,
                );
            });
        }
    }

    update(changedMap) {
        // console.log(
        //   `${this}.UPDATE(changedMap:${Array.from(changedMap.keys).join(", ")})`,
        //   changedMap,
        // );
        // Map(5) { stylePatchesSource → {…}, typeSpec → {…}, proseMirrorSchema → {…}, nodeSpecToTypeSpec → {…}, document → {…} }

        const newConfigItems = [];
        let schema = this.view.state.schema;
        const newProps = {};
        // CAUTION: proseMirrorSchema is treated like an optional dependency
        // some simple ProseMirror instances in here don't require it.
        // Hence, it should not hurt if it's not configured as a dependency
        // This is a bit subtle, but it works, so far, niceley.
        // TODO: A more explicit handling would be good!
        if (changedMap.has("proseMirrorSchema")) {
            const proseMirrorSchema = changedMap.get("proseMirrorSchema");
            schema = createProseMirrorSchemaFromMetaModel(
                this._proseMirrorDefaultSchema,
                proseMirrorSchema,
            );
            newConfigItems.push(["schema", schema]);
            const oldNodeViews = this.view.props.nodeViews || {},
                schemaNodes = proseMirrorSchema.get("nodes");
            for (const nodeName of schemaNodes.keys()) {
                //
                //, nodeViews: {
                //        '*': (...args/* node, view, getPos */)=>new ProsemirrorNodeView(this.widgetBus, ...args)
                //    }
                if (nodeName in oldNodeViews)
                    // Nothing to do
                    continue;

                // this node requires a new nodeView
                if (!("nodeViews" in newProps)) {
                    newProps.nodeViews = {};
                    for (const [nodeName, nodeView] of Object.entries(
                        oldNodeViews,
                    )) {
                        // Filter out removed nodeViews.
                        if (!schemaNodes.has(nodeName)) continue;
                        // Copy still required
                        newProps.nodeViews[nodeName] = nodeView;
                    }
                }
                newProps.nodeViews[nodeName] = this._createGenericNodeView;
            }

            // NOTE: it is required to rebuild all of the proseMirror doc
            // using the new Schema, as it's referenced. The docs somewhere
            // recommend to rebuild via JSON serialization, but we can use
            // the document updating code below. Maybe dropping the
            // this._nodesCache;
            this._nodesCache = new WeakMap();
            mapSetBiDirectional(this._nodesCache, schema, proseMirrorSchema);
        }
        // it looks like document has to change...
        const document = changedMap.has("document")
            ? changedMap.get("document")
            : this.getEntry("document");
        // IMPORTANT: a pm-node as well as a metamodel-node
        // can be used multiple times. Hence, the position of the node
        // in the document can't be stored this way. It simply can
        // have multiple adresses. More importantly for us here is
        // however, that a node identity can stay in-tact over multiple
        // generations, i.e. a node might change but its siblings stay
        // the same.

        // This is basically one lookup in this._nodesCache if nothing
        // is to do.

        const newDoc = this._createProseMirrorNode(
            this._nodesCache,
            document,
            schema,
        );

        if (newDoc !== this.view.state.doc) {
            // console.log(
            //    `${this}UPDATE: update view.state.doc with  metamodel document...`,
            // );
            // update view.state.doc with newDoc which is in sync
            // with the metamodel document
            newConfigItems.push(["doc", newDoc]);
            // update doc in the chache, we just changed it with the transactions.
            mapSetBiDirectional(this._nodesCache, document, newDoc);
        } else {
            // nothing to do;
            // this happens when document was changed via dispatchTransaction
            // and is already linked to state.doc.
            // I expect this to be the case most of the time, as
            // the metamodel document is updated in dispatchTransaction
            // when the editor causes the changes.
            // console.warn(`${this}UPDATE: newDoc - nothing to do`);
        }
        if (newConfigItems.length) {
            // console.log(
            //   `${this}UPDATE: newConfigItems ${newConfigItems.length} `,
            //   ...Array.from(zip(...newConfigItems))[0],
            // );
            const oldConfig = Object.fromEntries(
                    [
                        "schema",
                        "doc",
                        "selection",
                        "storedMarks",
                        "plugins",
                    ].map((key) => [key, this.view.state[key]]),
                ),
                newConfig = Object.fromEntries(newConfigItems),
                config = Object.assign({}, oldConfig, newConfig),
                state = EditorState.create(config);
            // setProps(props: Partial<DirectEditorProps>)
            // Update the view by updating existing props object with the
            // object given as argument. Equivalent to
            // view.update(Object.assign({}, view.props, props)).
            newProps.state = state;
            this.view.setProps(newProps);
        }
        //else {
        //  console.warn(`${this}UPDATE: newConfigItems - nothing to do`);
        // }
    }
}
