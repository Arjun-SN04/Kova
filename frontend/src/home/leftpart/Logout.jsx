import axios from 'axios'
import React, { useState } from 'react'
import Cookies from 'js-cookie'
import { useNavigate } from 'react-router-dom'
import { LuLoaderCircle, LuLogOut } from 'react-icons/lu'
import { useAuth } from '../../context/AuthProvider'
import useConversation from '../../Zustand/UserConversation'

// `label`: show text next to the icon (a full-width row) instead of an icon-only button
const Logout = ({ className = '', label = '' }) => {
  const [loading, setLoading] = useState(false)
  const [, setAuthUser] = useAuth()
  const { setSelectedConversation, setMessages, setPreviews, setUnreadCounts } = useConversation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await axios.post('/api/user/logout', {}, { withCredentials: true })
      localStorage.removeItem('chatUser')
      Cookies.remove('jwt')
      setSelectedConversation(null)
      setMessages([])
      setPreviews({})
      setUnreadCounts({})
      setAuthUser(null)
      navigate('/home')
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      title="Log out"
      aria-label="Log out"
      className={label ? className : `flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400 ${className}`}
    >
      {loading ? <LuLoaderCircle className="size-4.5 animate-spin" /> : <LuLogOut className="size-4.5" />}
      {label && <span>{label}</span>}
    </button>
  )
}

export default Logout
