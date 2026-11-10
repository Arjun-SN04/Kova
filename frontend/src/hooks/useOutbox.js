import { useEffect } from 'react'
import { useAuth } from '../context/AuthProvider'
import { useSocket } from '../context/SocketProvider'
import { flush, startOutbox } from '../utils/outbox'

// Sends messages that are waiting (typed offline, or failed) when the app opens,
// the network comes back or the realtime connection reconnects
const useOutbox = () => {
  const [AuthUser] = useAuth()
  const { socket } = useSocket()
  const myId = AuthUser?._id

  useEffect(() => {
    if (!myId) return
    startOutbox(myId)
    flush(myId)
    const onOnline = () => flush(myId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [myId])

  useEffect(() => {
    if (!socket || !myId) return
    const onConnect = () => flush(myId)
    socket.on('connect', onConnect)
    return () => socket.off('connect', onConnect)
  }, [socket, myId])
}

export default useOutbox
