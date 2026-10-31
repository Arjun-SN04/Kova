import { useEffect } from 'react'
import { useSocket } from '../context/SocketProvider'
import { useAuth } from '../context/AuthProvider'
import useBusiness from './store'

// Keeps the business store in sync while the chat screen is open:
// customer records (labels, waiting, leads), settings changes and "customer waiting" alerts.
const useBusinessSocket = () => {
  const { socket } = useSocket()
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id || '')
  const enabled = !!AuthUser?.business?.enabled

  useEffect(() => { if (myId) useBusiness.getState().loadMe() }, [myId, enabled])

  useEffect(() => {
    if (!socket) return
    const store = () => useBusiness.getState()
    const mine = (data) => String(data?.business) === myId
    const onRecord = (data) => { if (mine(data) && data.record) store().setRecord(data.record) }
    const onSettings = (data) => { if (mine(data)) store().loadOwn() }
    const onAlert = (data) => store().addAlert(data)
    const onTeam = () => store().loadMe()
    socket.on('businessInbox', onRecord)
    socket.on('businessCustomer', onRecord)
    socket.on('businessSettings', onSettings)
    socket.on('businessAlert', onAlert)
    socket.on('businessTeam', onTeam)
    return () => {
      socket.off('businessInbox', onRecord)
      socket.off('businessCustomer', onRecord)
      socket.off('businessSettings', onSettings)
      socket.off('businessAlert', onAlert)
      socket.off('businessTeam', onTeam)
    }
  }, [socket, myId])
}

export default useBusinessSocket
