import React, { useState } from 'react'
import ChatSettings from './ChatSettings'
import axios from 'axios'
import { motion } from 'motion/react'
import { LuAtSign, LuCalendar, LuMail, LuTrash2, LuUserMinus, LuX } from 'react-icons/lu'
import { useSocket } from '../../context/SocketProvider'
import useConversation from '../../Zustand/UserConversation'
import Avatar from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'

// Side panel with details about the person you're chatting with.
// Inline column on wide screens, slide-over drawer on smaller ones.
const ContactInfo = ({ user, onClose, onClear }) => {
  const { onlineUsers } = useSocket()
  const isOnline = !user.isSelf && onlineUsers.map(String).includes(String(user._id))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const firstName = user.fullName?.split(' ')[0]

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
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white xl:static xl:z-auto xl:w-80 xl:max-w-none dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <p className="text-[15px] font-semibold">Contact info</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <LuX className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center text-center">
            <Avatar name={user.fullName} src={user.avatar?.url} size="lg" online={isOnline} />
            <p className="mt-4 text-lg font-semibold">{user.fullName}</p>
            <p className={`mt-0.5 text-sm ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {user.isSelf ? 'Notes, links and files for yourself' : isOnline ? 'Online now' : 'Offline'}
            </p>
          </div>

          <dl className="mt-8 space-y-1 rounded-2xl bg-slate-50 p-2 dark:bg-slate-900">
            {user.username && (
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <LuAtSign className="size-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Username</dt>
                  <dd className="truncate text-sm font-medium">@{user.username}</dd>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <LuMail className="size-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="truncate text-sm font-medium">{user.email}</dd>
              </div>
            </div>
            {joined && (
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <LuCalendar className="size-4 shrink-0 text-slate-400" />
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Joined</dt>
                  <dd className="text-sm font-medium">{joined}</dd>
                </div>
              </div>
            )}
          </dl>

          <ChatSettings chat={user} />

          <button
            onClick={onClear}
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <LuTrash2 className="size-4" /> Clear chat
          </button>
          {!user.isSelf && (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex w-full items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <LuUserMinus className="size-4" /> Remove contact
            </button>
          )}
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
