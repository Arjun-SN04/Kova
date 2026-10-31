// Nexa sometimes writes <br> (often inside table cells). Markdown shows raw HTML as text,
// so turn <br> into a real line break; any other HTML tag is dropped.
export const remarkHtmlBreaks = () => (tree) => {
  const walk = (node) => {
    if (!node.children) return
    node.children = node.children.flatMap((c) => {
      if (c.type !== 'html') return [c]
      if (/^<br\s*\/?>$/i.test(c.value.trim())) return [{ type: 'break' }]
      // A lone simple tag like <b> or </i>: drop it, keep the text around it
      if (/^<\/?[a-z][a-z0-9]*\s*\/?>$/i.test(c.value.trim())) return []
      return [c]
    })
    node.children.forEach(walk)
  }
  walk(tree)
}

// A single newline inside a paragraph is a real line break (poems, addresses, short lines).
// Markdown would join those lines into one, so split the text there.
export const remarkLineBreaks = () => (tree) => {
  const walk = (node) => {
    if (!node.children || node.type === 'code' || node.type === 'inlineCode') return
    node.children = node.children.flatMap((c) => {
      if (c.type !== 'text' || !c.value.includes('\n')) return [c]
      return c.value.split('\n').flatMap((part, i) => (i ? [{ type: 'break' }, { type: 'text', value: part }] : [{ type: 'text', value: part }]))
    })
    node.children.forEach(walk)
  }
  walk(tree)
}
