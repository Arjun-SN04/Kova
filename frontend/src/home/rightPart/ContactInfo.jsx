import React, { useState } from 'react'
import ChatSettings from './ChatSettings'
import axios from 'axios'
import { motion } from 'motion/react'
import { LuAtSign, LuCalendar, LuCheck, LuCopy, LuMail, LuPhone, LuSearch, LuTrash2, LuUserMinus, LuVideo, LuX } from 'react-icons/lu'
import { useCall } from '../../context/CallProvider'
import MediaSummary from '../media/MediaSummary'
import { useSocket } from '../../context/SocketProvider'
import useConversation from '../../Zustand/UserConversation'
import Avatar from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'
import { useAuth } from '../../context/AuthProvider'
import useBusiness from '../../business/store'
import CustomerPanel from '../../business/CustomerPanel'
import { BusinessBadge, BusinessProfile, OpenStatus, SafetyActions } from '../../business/BusinessInfo'
import { isBusiness } from '../../business/utils'
import { ViewablePhoto } from '../../components/PhotoViewer'

// Side panel with details about the person you're chatting with.
// Inline column on wide screens, slide-over drawer on smaller ones.
const ContactInfo = ({ user, onClose, onClear, onSearch }) => {
  const { onlineUsers } = useSocket()
  const isOnline = !user.isSelf && onlineUsers.map(String).includes(String(user._id))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const firstName = user.fullName?.split(' ')[0]
  const [AuthUser] = useAuth()
  const { settings: bizSettings, records, setRecord } = useBusiness()
  // I'm a business and this is a customer chat: show the customer panel
  const showCustomer = isBusiness(AuthUser) && !user.isSelf && !isBusiness(user)

  // Removing a contact keeps the chat history, but neither of you can message the other
  const removeContact = async () => {
    try {
      await axios.delete(`/api/contacts/${user._id}`, { withCredentials: true })
      setConfirmRemove(false)
      onClose()
      useConversation.getState().removeContact(user._id)
    } catch (err) {
      console.log('removeContact error:', err)
    }
  }
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString([], { month: 'long', year: 'numeric' })
    : null
  const { startCall } = useCall()
  const [copied, setCopied] = useState(false)
  const copyUsername = async () => {
    try { await navigator.clipboard.writeText(`@${user.username}`); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* no clipboard */ }
  }
  const status = user.isSelf ? 'Notes, links and files for yourself' : isBusiness(user) ? <OpenStatus business={user.business} /> : isOnline ? 'Online' : 'Offline'
  const quick = 'flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-slate-200/80 py-3 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900'
  const danger = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'

  return (
    <>
      <motion.div
        className="fixed inset-0 z-30 bg-slate-950/30 xl:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white xl:static xl:z-auto xl:w-[22rem] xl:max-w-none dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-5 dark:border-slate-800">
          <p className="truncate text-[15px] font-semibold">{user.isSelf ? 'Your notes' : 'Contact info'}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <LuX className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-5 sm:pt-7">
          {/* Who */}
          <div className="flex flex-col items-center text-center">
            <ViewablePhoto src={user.avatar?.url} name={user.fullName} subtitle={user.username ? `@${user.username}` : ''}>
              <Avatar name={user.fullName} src={user.avatar?.url} size="lg" online={isOnline} />
            </ViewablePhoto>
            <p className="mt-4 flex items-center gap-1.5 text-xl font-semibold tracking-tight">{user.fullName} <BusinessBadge business={user.business} className="size-4.5" /></p>
            {user.username && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">@{user.username}</p>}
            <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isOnline ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400'
            }`}>
              {!user.isSelf && !isBusiness(user) && <span className={`size-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />}
              {status}
            </span>
          </div>

          {/* Quick actions */}
          {!user.isSelf && (
            <div className="mt-6 flex gap-2">
              <button onClick={() => startCall(user, 'voice')} className={quick}><LuPhone className="size-4.5 text-indigo-600 dark:text-indigo-400" />Audio</button>
              <button onClick={() => startCall(user, 'video')} className={quick}><LuVideo className="size-4.5 text-indigo-600 dark:text-indigo-400" />Video</button>
              {onSearch && <button onClick={() => { onSearch(); if (window.innerWidth < 1280) onClose() }} className={quick}><LuSearch className="size-4.5 text-indigo-600 dark:text-indigo-400" />Search</button>}
            </div>
          )}

          {/* About */}
          {user.about && (
            <div className="mt-6">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">About</p>
              <p className="mt-1.5 px-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{user.about}</p>
            </div>
          )}

          <MediaSummary chat={user} />

          {/* Details */}
          <div className="mt-6">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Details</p>
            <dl className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
              {user.username && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <LuAtSign className="size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Username</dt>
                    <dd className="truncate text-sm font-medium">@{user.username}</dd>
                  </div>
                  <button onClick={copyUsername} className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Copy username" aria-label="Copy username">
                    {copied ? <LuCheck className="size-4 text-emerald-500" /> : <LuCopy className="size-4" />}
                  </button>
                </div>
              )}
              {user.email && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <LuMail className="size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Email</dt>
                    <dd className="truncate text-sm font-medium">{user.email}</dd>
                  </div>
                </div>
              )}
              {joined && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <LuCalendar className="size-4 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Joined</dt>
                    <dd className="text-sm font-medium">{joined}</dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {!user.isSelf && <BusinessProfile user={user} />}

          {showCustomer && (
            <div className="mt-6">
              <CustomerPanel
                key={user._id}
                biz="me"
                customerId={user._id}
                record={records[String(user._id)]}
                settings={bizSettings}
                team={[AuthUser, ...(bizSettings?.team || []).map((t) => t.user).filter(Boolean)]}
                onChange={setRecord}
              />
            </div>
          )}

          <p className="mt-6 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Chat settings</p>
          <div className="-mt-4"><ChatSettings chat={user} /></div>

          {/* Danger zone */}
          <div className="mt-6 rounded-2xl border border-slate-200/80 p-1.5 dark:border-slate-800">
            <button onClick={onClear} className={danger}><LuTrash2 className="size-4" /> Clear chat</button>
            {!user.isSelf && (
              <button onClick={() => setConfirmRemove(true)} className={danger}><LuUserMinus className="size-4" /> Remove contact</button>
            )}
            {!user.isSelf && <SafetyActions user={user} onBlocked={() => { onClose(); useConversation.getState().removeContact(user._id) }} />}
          </div>
        </div>
      </motion.aside>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={removeContact}
        icon={LuUserMinus}
        title={`Remove ${firstName}?`}
        description={`You won't be able to message each other until one of you adds the other again. Your chat history stays.`}
        confirmLabel="Remove"
        busyLabel="Removing…"
      />
    </>
  )
}

export default ContactInfo
