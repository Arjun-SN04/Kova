import { useSyncExternalStore } from 'react'

// Narrow screen (phones): the layout without the section rail
const QUERY = '(max-width: 767px)'
const subscribe = (cb) => {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useIsPhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)

export default useIsPhone
