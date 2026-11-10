import React, { Suspense, lazy } from 'react'

// react-markdown is fairly large, so it's downloaded the first time a message needs it.
// Same props as react-markdown; the plain text shows for that moment.
const ReactMarkdown = lazy(() => import('react-markdown'))

const Markdown = (props) => (
  <Suspense fallback={<span className="whitespace-pre-wrap">{props.children}</span>}>
    <ReactMarkdown {...props} />
  </Suspense>
)

export default Markdown
