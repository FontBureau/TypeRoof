export function traverseDom(domNode: Node, activeMarks: string[], outputNodes: any[]) {
  // 1. Skip pure whitespace text nodes between block elements
  if (domNode.nodeType === Node.TEXT_NODE && !domNode.textContent?.trim()) {
    console.log('traverseDom return reason: EMPTY TEXT');
    return;
  }

  if(domNode.nodeType === Node.DOCUMENT_NODE) {
    const content = [];
    Array.from(domNode.body.childNodes).forEach(child => {
      traverseDom(child, activeMarks, content);
    });
    outputNodes.push({ type: 'doc', content });
    console.log('traverseDom return reason: FOUND DOCUMENT_NODE');
    return;
  }


  // 2. Process Known Block Elements
  if (domNode.nodeName === 'SECTION') {
    const content = [];
    Array.from(domNode.childNodes).forEach(child => {
      traverseDom(child, activeMarks, content);
    });
    outputNodes.push({ type: 'section', content });
    console.log('traverseDom return reason: FOUND SECTION');
    return;
  }

  if (domNode.nodeName === 'P') {
    const paragraphContent = [];
    Array.from(domNode.childNodes).forEach(child => {
      traverseDom(child, activeMarks, paragraphContent);
    });
    outputNodes.push({ type: 'paragraph', content: paragraphContent });
    console.log('traverseDom return reason: FOUND PARAGRAPH');
    return;
  }

  // 3. Process Known Inline Elements / Marks
  if (domNode.nodeName === 'B' || domNode.nodeName === 'STRONG') {
    const nextMarks = [...activeMarks, 'bold'];
    Array.from(domNode.childNodes).forEach(child => {
      traverseDom(child, nextMarks, outputNodes);
    });
    console.log('traverseDom return reason: FOUND STRONG');
    return;
  }

  // 4. THE CATCH-ALL: Unrecognized Elements
  if (domNode.nodeType === Node.ELEMENT_NODE) {
    const el = domNode as Element;

    // Instead of throwing an error or dropping the content,
    // serialize this entire DOM branch back to a string
    const rawHTMLString = el.outerHTML;

    outputNodes.push({
      type: 'raw_html_block',
      attrs: { html: rawHTMLString }
    });

    // Prune the branch! We serialized the children,
    // so we don't want to traverse into them.
    console.log('traverseDom return reason: NOT FOUND (RAW)' + domNode.nodeName);
    return;
  }

  // 5. Emit Text Leaves
  if (domNode.nodeType === Node.TEXT_NODE) {
    outputNodes.push({
      type: 'text',
      text: domNode.textContent,
      marks: activeMarks.map(m => ({ type: m }))
    });
    console.log('traverseDom return reason: TEXT '+ domNode.textContent);
    return;
  }
  console.log('traverseDom FALLING THROUGH', domNode.nodeName, domNode.nodeType, Node.DOCUMENT_NODE);
}
