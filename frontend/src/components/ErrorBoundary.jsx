import React from 'react'
import { LuRefreshCw, LuTriangleAlert } from 'react-icons/lu'

// Catches a crash in part of the app and shows "Something went wrong" with Reload,
// instead of a blank page. `compact` is for a panel (e.g. the open chat), with Try again.
// After a new version is deployed, an old tab can fail to download a page it hasn't
// opened yet; that's shown as "Kova was updated" (a reload fixes it).
const isChunkError = (error) => /Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String(error?.message || error))

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    // Moving to another chat / page clears the error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const updated = isChunkError(error)
    const title = updated ? 'Kova was updated' : 'Something went wrong'
    const text = updated ? 'Reload to get the latest version.' : 'This part of Kova hit a problem. Reloading usually fixes it.'
    const reload = () => window.location.reload()

    if (this.props.compact) {
      return (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <LuTriangleAlert className="size-8 text-amber-500" />
          <p className="font-semibold">{title}</p>
          <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>
          <div className="flex gap-2">
            {!updated && <button onClick={() => this.setState({ error: null })} className="h-9 rounded-lg px-4 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800">Try again</button>}
            <button onClick={reload} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"><LuRefreshCw className="size-4" /> Reload</button>
          </div>
        </div>
      )
    }
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white p-6 text-center text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <LuTriangleAlert className="size-10 text-amber-500" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{text}</p>
        <button onClick={reload} className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-500"><LuRefreshCw className="size-4" /> Reload</button>
      </div>
    )
  }
}

export default ErrorBoundary
