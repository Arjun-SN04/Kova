import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import useConversation from '../Zustand/UserConversation'
import { resetOutbox } from '../utils/outbox'

export const AuthContext = createContext()

// Older versions saved the password hash in the browser; strip it out.
const readStoredUser = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('chatUser'))
    if (!stored) return null
    if ('password' in stored || 'confirmPassword' in stored) {
      delete stored.password
      delete stored.confirmPassword
      localStorage.setItem('chatUser', JSON.stringify(stored))
    }
    return stored
  } catch {
    return null
  }
}

const AuthProvider = ({ children }) => {
  const [AuthUser, setAuthUser] = useState(readStoredUser)

  // If the login cookie is missing or expired, the API answers 401.
  // Drop the saved user so the app goes back to the login screen.
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (error) => {
        const url = error.config?.url || ''
        const isAuthCall = /\/user\/(login|signup)/.test(url)
        if (error.response?.status === 401 && !isAuthCall) {
          localStorage.removeItem('chatUser')
          setAuthUser(null)
        }
        return Promise.reject(error)
      }
    )
    return () => axios.interceptors.response.eject(id)
  }, [])

  // Signed out (any way: Log out, session ended, account deleted): forget what this browser
  // kept for that account — drafts, messages waiting to be sent, and the offline copy of chats
  const userId = AuthUser?._id
  useEffect(() => {
    if (userId) return
    try {
      Object.keys(localStorage).filter((k) => k === 'kova-drafts' || k.startsWith('kova-outbox:')).forEach((k) => localStorage.removeItem(k))
    } catch { /* private mode */ }
    useConversation.setState({ drafts: {} })
    resetOutbox()
    navigator.serviceWorker?.controller?.postMessage({ type: 'signed-out' })
  }, [userId])

  // Refresh my saved profile from the server once per load (e.g. new username)
  useEffect(() => {
    if (!readStoredUser()) return
    axios.get('/api/user/me', { withCredentials: true })
      .then((res) => {
        localStorage.setItem('chatUser', JSON.stringify(res.data))
        setAuthUser(res.data)
      })
      .catch(() => { /* a 401 is handled by the interceptor above */ })
  }, [])

  return (
    <AuthContext.Provider value={[AuthUser, setAuthUser]}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthProvider

export const useAuth = () => useContext(AuthContext)
