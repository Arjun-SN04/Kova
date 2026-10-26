import { useEffect } from 'react'

// Sets the browser tab title, e.g. "Sign in · Kova".
const usePageTitle = (title) => {
  useEffect(() => {
    document.title = title ? `${title} · Kova` : 'Kova · Real-time messaging'
  }, [title])
}

export default usePageTitle
