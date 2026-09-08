import {
    _BaseComponent
  , _BaseContainerComponent
} from './basics/component.mjs';

import {
    Collapsible
} from './generic.mjs';

import {
    createIcon
} from './icons.mjs';

import './ui-comments.css';

/**
 * Connects the "Add comment..." button, which lives in the sidebar, with
 * the UICommentsOverlay, which lives in the layout zone. Both receive the
 * same bridge instance from the MainUIController.
 */
export class CommentsBridge {
    constructor() {
        this._startAddComment = null;
        this._commentsVisible = true;
        this._changeListeners = new Set();
    }
    /**
     * Called by the UICommentsOverlay. There's only one overlay, hence
     * registering just overrides a previous, destroyed, overlay.
     */
    setStartAddComment(fn) {
        this._startAddComment = fn;
    }
    unsetStartAddComment(fn) {
        if(this._startAddComment === fn)
            this._startAddComment = null;
    }
    get canAddComment() {
        return this._startAddComment !== null;
    }
    startAddComment() {
        if(this._startAddComment !== null)
            this._startAddComment();
    }

    /**
     * Whether the comments in the layout are shown. This is ephemeral
     * UI state, it is deliberately not part of the model.
     */
    get commentsVisible() {
        return this._commentsVisible;
    }
    set commentsVisible(visible) {
        const _visible = !!visible;
        if(this._commentsVisible === _visible)
            return;
        this._commentsVisible = _visible;
        for(const listener of this._changeListeners)
            listener(this._commentsVisible);
    }
    addCommentsVisibleListener(fn) {
        this._changeListeners.add(fn);
    }
    removeCommentsVisibleListener(fn) {
        this._changeListeners.delete(fn);
    }
}

/**
 * The button that initiates picking a position for a new comment.
 */
export class UIAddCommentButton extends _BaseComponent {
    constructor(widgetBus, commentsBridge) {
        super(widgetBus);
        this._commentsBridge = commentsBridge;
        this.element = this._domTool.createElement('button', {
                'class': 'ui_comments-add_button'
              , type: 'button'
            }
          , 'Add comment...'
        );
        this._onClick = this._onClickHandler.bind(this);
        this.element.addEventListener('click', this._onClick);
        this._insertElement(this.element);
    }
    _onClickHandler() {
        this._commentsBridge.startAddComment();
    }
    destroy() {
        this.element.removeEventListener('click', this._onClick);
    }
}

/**
 * Toggles the visibility of the comments in the layout.
 */
export class UIShowCommentsCheckbox extends _BaseComponent {
    constructor(widgetBus, commentsBridge) {
        super(widgetBus);
        this._commentsBridge = commentsBridge;
        this._input = this._domTool.createElement('input', {type: 'checkbox'});
        this._input.checked = this._commentsBridge.commentsVisible;
        this.element = this._domTool.createElement('label', {
                'class': 'ui_comments-show_comments'
            }
          , [this._input, this._domTool.createElement('span', {}, 'Show comments')]
        );
        this._onChange = this._onChangeHandler.bind(this);
        this._onCommentsVisibleChange = this._onCommentsVisibleChangeHandler.bind(this);
        this._input.addEventListener('change', this._onChange);
        this._commentsBridge.addCommentsVisibleListener(this._onCommentsVisibleChange);
        this._insertElement(this.element);
    }
    _onChangeHandler() {
        this._commentsBridge.commentsVisible = this._input.checked;
    }
    _onCommentsVisibleChangeHandler(visible) {
        this._input.checked = visible;
    }
    destroy() {
        this._input.removeEventListener('change', this._onChange);
        this._commentsBridge.removeCommentsVisibleListener(this._onCommentsVisibleChange);
    }
}

/**
 * Renders one balloon per item in the "comments" list and implements the
 * interaction to create a new comment: pick a position in the layout,
 * then type the comment into a draft balloon.
 */
export class UICommentsOverlay extends _BaseComponent {
    constructor(widgetBus, commentsBridge, layoutElement) {
        super(widgetBus);
        this._commentsBridge = commentsBridge;
        this._layoutElement = layoutElement;
        this._draftElement = null;
        this._draftPath = null;
        this._draftInput = null;
        // [path, balloonElement] for each rendered comment, so the
        // balloons can be repositioned without re-rendering.
        this._balloons = [];
        // The pending _updatePositions animation frame, see _onResize.
        this._updatePositionsFrame = null;
        // The pending "start picking" timeout, see _startAddComment.
        this._armPickingTimeout = null;
        this._isPicking = false;
        // The element under the cursor while picking, it is highlighted
        // like the anchors of the existing comments.
        this._hoveredElement = null;

        this.element = this._domTool.createElement('div', {'class': 'ui_comments'});
        // The highlights are drawn as boxes on top of the highlighted
        // elements, rather than styling those elements directly, so the
        // layout contents are not touched at all. The container keeps
        // them together, so they survive re-rendering the balloons.
        this._highlightsElement = this._domTool.createElement('div'
                                    , {'class': 'ui_comments-highlights'});
        this.element.append(this._highlightsElement);
        this._insertElement(this.element);

        this._onArmPicking = this._onArmPickingHandler.bind(this);
        this._onPickClick = this._onPickClickHandler.bind(this);
        this._onCancelPicking = this._onCancelPickingHandler.bind(this);
        this._onPickHover = this._onPickHoverHandler.bind(this);
        this._onDraftSubmit = this._onDraftSubmitHandler.bind(this);
        this._onDraftCancel = this._onDraftCancelHandler.bind(this);
        this._onDraftKeydown = this._onDraftKeydownHandler.bind(this);
        this._startAddComment = this._startAddCommentHandler.bind(this);
        this._commentsBridge.setStartAddComment(this._startAddComment);

        this._onCommentsVisibleChange = this._setCommentsVisible.bind(this);
        this._commentsBridge.addCommentsVisibleListener(this._onCommentsVisibleChange);
        this._setCommentsVisible(this._commentsBridge.commentsVisible);

        // The balloon positions are derived from the layout contents,
        // hence they must be updated when the layout is resized/reflowed.
        this._onResize = this._onResizeHandler.bind(this);
        this._domTool.window.addEventListener('resize', this._onResize);
        this._resizeObserver = new this._domTool.window.ResizeObserver(this._onResize);
        this._resizeObserver.observe(this._layoutElement);
        // The layout contents can reflow without changing the box of the
        // layout element itself, e.g. when a sidebar edit changes an actor.
        // The ResizeObserver doesn't fire in that case, the mutations of
        // the layout contents do.
        this._onMutation = this._onMutationHandler.bind(this);
        this._mutationObserver = new this._domTool.window.MutationObserver(this._onMutation);
        this._mutationObserver.observe(this._layoutElement, {
            childList: true
          , subtree: true
          , attributes: true
          , characterData: true
        });
    }

    /**
     * Positioning the balloons mutates the overlay, those mutations must
     * not schedule another update, that would never stop.
     */
    _onMutationHandler(records) {
        for(const record of records) {
            if(this.element.contains(record.target))
                continue;
            this._onResize();
            return;
        }
    }

    /**
     * Resize events can come in bursts, updating once per frame is enough.
     */
    _onResizeHandler() {
        if(this._updatePositionsFrame !== null)
            return;
        this._updatePositionsFrame = this._domTool.window.requestAnimationFrame(()=>{
            this._updatePositionsFrame = null;
            this._updatePositions();
        });
    }

    _cancelUpdatePositions() {
        if(this._updatePositionsFrame === null)
            return;
        this._domTool.window.cancelAnimationFrame(this._updatePositionsFrame);
        this._updatePositionsFrame = null;
    }

    /**
     * Move the balloons to where their elements are now. A balloon whose
     * path doesn't resolve anymore is hidden, it may become resolvable
     * again, e.g. when the layout element is re-created.
     */
    _updatePositions() {
        const entries = this._draftPath !== null && this._draftElement !== null
                ? [...this._balloons, [this._draftPath, this._draftElement]]
                : this._balloons
                ;
        for(const [path, element] of entries) {
            const position = this._getPathPosition(path);
            if(position === null) {
                element.hidden = true;
                continue;
            }
            const [x, y] = position;
            element.hidden = false;
            element.style.setProperty('left', `${x}px`);
            element.style.setProperty('top', `${y}px`);
        }
        this._updateHighlights();
    }

    /**
     * The box of element within the layout zone content box, i.e. in
     * the same coordinates as the balloon positions.
     */
    _getElementBox(element) {
        const layoutRect = this._layoutElement.getBoundingClientRect()
          , rect = element.getBoundingClientRect()
          ;
        return [
            rect.left - layoutRect.left + this._layoutElement.scrollLeft
          , rect.top - layoutRect.top + this._layoutElement.scrollTop
          , rect.width
          , rect.height
        ];
    }

    /**
     * The anchor elements of the rendered comments, of the draft and the
     * element under the cursor while picking are highlighted, so it is
     * visible which part of the layout a comment belongs to.
     */
    _updateHighlights() {
        // Hidden comments have no visible balloon, hence their anchors
        // are not highlighted either.
        const paths = this._commentsBridge.commentsVisible
                ? this._balloons.map(([path])=>path)
                : []
                ;
        if(this._draftPath !== null)
            paths.push(this._draftPath);
        const elements = new Set();
        for(const path of paths) {
            const element = this._resolveElementPath(path);
            if(element !== null)
                elements.add(element);
        }
        if(this._hoveredElement !== null)
            elements.add(this._hoveredElement);
        this._domTool.clear(this._highlightsElement);
        for(const element of elements) {
            const [x, y, width, height] = this._getElementBox(element);
            this._highlightsElement.append(
                this._domTool.createElement('div', {
                    'class': 'ui_comments-highlight'
                  , style: `left: ${x}px; top: ${y}px;`
                          + `width: ${width}px; height: ${height}px;`
                })
            );
        }
    }

    _setCommentsVisible(visible) {
        this.element.classList.toggle('ui_comments-hidden', !visible);
        this._updateHighlights();
    }

    get _document() {
        return this._domTool.document;
    }

    /**
     * The click that triggered this is still propagating, hence the
     * document level listener is only attached after it finished,
     * otherwise it would pick a position immediately.
     */
    _startAddCommentHandler() {
        if(this._isPicking || this._armPickingTimeout !== null)
            return;
        this._armPickingTimeout = setTimeout(this._onArmPicking, 0);
    }

    _onArmPickingHandler() {
        this._armPickingTimeout = null;
        this._isPicking = true;
        this._document.body.classList.add('ui_comments-picking');
        this._document.addEventListener('click', this._onPickClick, true);
        this._document.addEventListener('keydown', this._onCancelPicking, true);
        this._document.addEventListener('mousemove', this._onPickHover, true);
    }

    _stopPicking() {
        if(this._armPickingTimeout !== null) {
            clearTimeout(this._armPickingTimeout);
            this._armPickingTimeout = null;
        }
        if(!this._isPicking)
            return;
        this._isPicking = false;
        this._document.body.classList.remove('ui_comments-picking');
        this._document.removeEventListener('click', this._onPickClick, true);
        this._document.removeEventListener('keydown', this._onCancelPicking, true);
        this._document.removeEventListener('mousemove', this._onPickHover, true);
        this._setHoveredElement(null);
    }

    /**
     * The highlight follows the cursor while picking, so it is clear
     * which element the click is going to anchor the comment to.
     */
    _onPickHoverHandler(event) {
        this._setHoveredElement(this._layoutElement.contains(event.target)
                                    ? event.target
                                    : null);
    }

    _setHoveredElement(element) {
        // The overlay is not part of the layout contents, a comment
        // can't be anchored to it.
        const _element = element !== null && !this.element.contains(element)
                ? element
                : null
                ;
        if(this._hoveredElement === _element)
            return;
        this._hoveredElement = _element;
        this._updateHighlights();
    }

    _onPickClickHandler(event) {
        // Clicking outside of the layout aborts, so the crosshair cursor
        // doesn't get stuck when the user changes their mind.
        if(!this._layoutElement.contains(event.target)) {
            this._stopPicking();
            return;
        }
        // The layout must not react to this click, it only selects the
        // position for the new comment.
        event.preventDefault();
        event.stopPropagation();
        this._stopPicking();

        this._showDraft(this._getElementPath(event.target));
    }

    /**
     * The children of the layout element that can be addressed by a
     * comment path. The overlay itself is not part of the layout, it
     * must not shift the indexes of its siblings.
     */
    _getPathChildren(element) {
        return Array.from(element.children)
                    .filter(child=>child !== this.element);
    }

    /**
     * A path of child indexes from the root layout element to element,
     * e.g. "3/5/2". The empty string is the layout element itself.
     */
    _getElementPath(element) {
        const indexes = [];
        let current = element;
        while(current !== this._layoutElement) {
            const parent = current.parentElement;
            if(parent === null)
                // Not within the layout, shouldn't happen, as the caller
                // checks for containment.
                return '';
            indexes.unshift(this._getPathChildren(parent).indexOf(current));
            current = parent;
        }
        return indexes.join('/');
    }

    /**
     * The inverse of _getElementPath. Returns null if the path can't be
     * resolved, e.g. because the layout changed since the comment was
     * created.
     */
    _resolveElementPath(path) {
        let current = this._layoutElement;
        if(path === '')
            return current;
        for(const index of path.split('/')) {
            const child = this._getPathChildren(current)[parseInt(index, 10)];
            if(child === undefined)
                return null;
            current = child;
        }
        return current;
    }

    /**
     * The position within the layout zone content box the balloon tip
     * points at: the top center of the element. Returns null if the
     * path can't be resolved.
     */
    _getPathPosition(path) {
        const element = this._resolveElementPath(path);
        if(element === null)
            return null;
        const layoutRect = this._layoutElement.getBoundingClientRect()
          , rect = element.getBoundingClientRect()
            // The balloon is centered on x, keep it from overflowing the
            // left edge of the layout zone, it is at most 300px wide.
          , x = Math.max(rect.left - layoutRect.left + this._layoutElement.scrollLeft
                            + rect.width / 2, 150)
          , y = rect.top - layoutRect.top + this._layoutElement.scrollTop
          ;
        return [x, y];
    }

    _onCancelPickingHandler(event) {
        if(event.key === 'Escape') {
            this._stopPicking();
            return;
        }
    }

    _removeDraft() {
        if(this._draftElement === null)
            return;
        this._draftElement.remove();
        this._draftElement = null;
        this._draftPath = null;
        this._draftInput = null;
        this._updateHighlights();
    }

    /**
     * The draft handlers operate on the current draft, there's at most
     * one at a time, hence they can be bound once in the constructor.
     */
    _onDraftSubmitHandler() {
        const path = this._draftPath
          , comment = this._draftInput.value.trim()
          ;
        this._removeDraft();
        // An empty comment would create a balloon without content,
        // submitting it is treated like cancelling.
        if(comment === '')
            return;
        this._addComment(path, comment);
    }

    _onDraftCancelHandler() {
        this._removeDraft();
    }

    _onDraftKeydownHandler(event) {
        if(event.key === 'Enter') {
            event.preventDefault();
            this._onDraftSubmit();
        }
        else if(event.key === 'Escape') {
            event.preventDefault();
            this._removeDraft();
        }
    }

    _showDraft(path) {
        this._removeDraft();
        const position = this._getPathPosition(path);
        if(position === null)
            return;
        const [x, y] = position;
        const input = this._domTool.createElement('textarea', {
                'class': 'ui_comment-input'
              , placeholder: 'Comment...'
              , rows: 2
            })
          , okButton = this._domTool.createElement('button', {type: 'button'}, 'Ok')
          , cancelButton = this._domTool.createElement('button', {type: 'button'}, 'Cancel')
          , draft = this._domTool.createElement('div', {
                    'class': 'ui_comment ui_comment-draft'
                  , style: `left: ${x}px; top: ${y}px;`
                }
              , [
                    input
                  , this._domTool.createElement('div'
                        , {'class': 'ui_comment-buttons'}
                        , [okButton, cancelButton])
                ]
            )
          ;
        okButton.addEventListener('click', this._onDraftSubmit);
        cancelButton.addEventListener('click', this._onDraftCancel);
        input.addEventListener('keydown', this._onDraftKeydown);
        this.element.append(draft);
        this._draftElement = draft;
        this._draftPath = path;
        this._draftInput = input;
        this._updateHighlights();
        input.focus();
    }

    _addComment(path, comment) {
        return this._changeState(()=>{
            const comments = this.getEntry('comments')
              , newComment = comments.constructor.Model.createPrimalDraft(comments.dependencies)
              ;
            newComment.getDraftFor('path').value = path;
            newComment.getDraftFor('comment').value = comment;
            comments.push(newComment);
        });
    }

    _deleteComment(key) {
        const question = 'Delete this comment?';
        if(!this._domTool.window.confirm(question))
            return;
        return this._changeState(()=>{
            this.getEntry('comments').delete(key);
        });
    }

    _renderComments(comments) {
        // The draft is not part of the model and the highlights are
        // updated separately, both must survive re-rendering.
        for(const element of Array.from(this.element.children)) {
            if(element !== this._draftElement && element !== this._highlightsElement)
                element.remove();
        }
        const balloons = [];
        this._balloons = [];
        for(const [key, comment] of comments) {
            const deleteButton = this._domTool.createElement('button', {
                    'class': 'ui_comment-delete_button'
                  , type: 'button'
                  , title: 'Delete this comment.'
                }
              , createIcon('delete')
            );
            // The key is only valid for this rendering, however, the
            // comments are re-rendered whenever the list changes.
            deleteButton.addEventListener('click', ()=>this._deleteComment(key));
            // The layout may have changed since the comment was created,
            // in that case the element is gone and the balloon is hidden
            // by _updatePositions, until the element is back.
            const path = comment.get('path').value
              , position = this._getPathPosition(path)
              , [x, y] = position !== null ? position : [0, 0]
              , balloon = this._domTool.createElement('div', {
                    'class': 'ui_comment'
                  , style: `left: ${x}px; top: ${y}px;`
                  , ...(position === null ? {hidden: ''} : {})
                }
              , [
                    this._domTool.createElement('div'
                        , {'class': 'ui_comment-text'}
                        , comment.get('comment').value)
                  , deleteButton
                ]
            );
            balloons.push(balloon);
            this._balloons.push([path, balloon]);
        }
        // Keep the draft, if any, on top of the balloons.
        if(this._draftElement !== null)
            this._draftElement.before(...balloons);
        else
            this.element.append(...balloons);
        this._updateHighlights();
    }

    update(changedMap) {
        if(changedMap.has('comments'))
            this._renderComments(changedMap.get('comments'));
    }

    destroy() {
        this._cancelUpdatePositions();
        this._resizeObserver.disconnect();
        this._mutationObserver.disconnect();
        this._domTool.window.removeEventListener('resize', this._onResize);
        this._stopPicking();
        this._removeDraft();
        this._commentsBridge.unsetStartAddComment(this._startAddComment);
        this._commentsBridge.removeCommentsVisibleListener(this._onCommentsVisibleChange);
    }
}

/**
 * The "Comments" collapsible in the sidebar.
 */
export class UICommentsCollapsible extends _BaseContainerComponent {
    constructor(widgetBus, _zones, commentsBridge, togglerLabel='Comments'
                        , isOpened=false) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_comments-panel'})
          , contentsZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones
                , ['main', localZoneElement]
                , ['contents', contentsZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        const widgets = [
            [
                {zone: 'main'}
              , []
              , Collapsible
              , togglerLabel
              , contentsZoneElement
              , isOpened
            ]
          , [
                {zone: 'contents'}
              , []
              , UIAddCommentButton
              , commentsBridge
            ]
          , [
                {zone: 'contents'}
              , []
              , UIShowCommentsCheckbox
              , commentsBridge
            ]
        ];
        this._initWidgets(widgets);
    }
}

/**
 * The widget definitions a layout controller must add in order to have
 * comments: the overlay in the "layout" zone and the sidebar collapsible
 * in the "after-main" zone, both sharing one UIComments instance.
 */
export function createCommentsWidgets(zones) {
    const commentsBridge = new CommentsBridge();
    return [
        [
            {zone: 'layout'}
          , ['comments']
          , UICommentsOverlay
          , commentsBridge
          , zones.get('layout')
        ]
      , [
            {zone: 'after-main'}
          , []
          , UICommentsCollapsible
          , zones
          , commentsBridge
        ]
    ];
}
