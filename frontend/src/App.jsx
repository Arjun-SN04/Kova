import React, { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'motion/react'
import ChatLayout from './home/ChatLayout'
import Signup from './components/Signup'
import Login from './components/Login'
import ForgotPassword from './components/ForgotPassword'
import HomePage from './components/HomePage'
import Profile from './components/Profile'
import InvitePage from './components/InvitePage'
import GroupLinkPage from './components/GroupLinkPage'
import BusinessPage from './business/BusinessPage'
import PublicPage from './business/PublicPage'
import OrderPage from './business/OrderPage'
import { takeReturnTo } from './business/utils'
import { takePendingInvite } from './utils/contacts'
import { useAuth } from './context/AuthProvider'
import { PageTransition } from './components/ui'
import AppLockGate from './components/AppLock'

// ── App ─────────────────────────────────────────────────────
const page = (el) => <PageTransition>{el}</PageTransition>

const App = () => {
  const [AuthUser] = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Opened an invite link while logged out? Go back to it once logged in.
  useEffect(() => {
    if (!AuthUser) return
    const token = takePendingInvite()
    if (token && !location.pathname.startsWith('/invite/')) { navigate(`/invite/${token}`, { replace: true }); return }
    // A business page opened while signed out
    const back = takeReturnTo()
    if (back && back !== location.pathname) navigate(back, { replace: true })
  }, [AuthUser, location.pathname, navigate])

  return (
    <MotionConfig reducedMotion="user">
      {AuthUser && <AppLockGate key={AuthUser._id} />}
      <AnimatePresence mode="wait" onExitComplete={() => window.scrollTo(0, 0)}>
        <Routes location={location} key={location.pathname}>
          <Route path='/home' element={page(<HomePage />)} />
          <Route path='/' element={AuthUser ? page(<ChatLayout />) : <Navigate to="/home" />} />
          <Route path='/signup' element={AuthUser ? <Navigate to="/" /> : page(<Signup />)} />
          <Route path='/login' element={AuthUser ? <Navigate to="/" /> : page(<Login />)} />
          <Route path='/forgot-password' element={AuthUser ? <Navigate to="/" /> : page(<ForgotPassword />)} />
          <Route path='/invite/:token' element={page(<InvitePage />)} />
          <Route path='/g/:code' element={page(<GroupLinkPage />)} />
          <Route path='/business' element={AuthUser ? page(<BusinessPage />) : <Navigate to="/login" />} />
          <Route path='/b/:username' element={page(<PublicPage />)} />
          <Route path='/order/:id' element={AuthUser ? page(<OrderPage />) : <Navigate to="/login" />} />
          <Route path='/profile' element={AuthUser ? page(<Profile />) : <Navigate to="/login" />} />
          <Route path='*' element={<Navigate to={AuthUser ? '/' : '/home'} />} />
        </Routes>
      </AnimatePresence>
    </MotionConfig>
  )
}

export default App
